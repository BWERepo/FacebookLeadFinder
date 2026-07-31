/**
 * Google Places API (New) v1 adapter.
 *
 * Auth: header "X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>" — a Cloudflare
 * Worker secret, read from `process.env` here and never sent to the browser
 * (see user_settings' migration comment and Settings' getProviderStatus).
 * Every request also sends the mandatory `X-Goog-FieldMask` header; Places
 * returns a 400 without one.
 *
 * `searchBusinesses` picks the Places endpoint that matches the criteria: a
 * ZIP-radius search has a real center point, so it calls `:searchNearby`;
 * area-code and state/county searches don't, so they call `:searchText` with
 * a location phrase baked into the query text instead. Places itself caps
 * result paging at 3 pages of 20 and stops returning `nextPageToken` past
 * that — a hard API limit this adapter doesn't need to track separately.
 *
 * Places' own `websiteUri` field is the only "does this business have a
 * website" signal this adapter can get — it never claims more than that. A
 * `websiteUri` pointing at facebook.com is read as evidence of a Facebook
 * page, not as "no separate website exists"; Places has no way to positively
 * confirm a Facebook *business page*. `findPublicEmail` never constructs an
 * address — Places doesn't return one at all — but for a business with no
 * website, it falls back to a Brave Search web lookup
 * (brave-search.server.ts) for a literally-published address on some other
 * public page (a directory, a listing, a mention). See COMPLIANCE.md.
 */

import { fetchWithBackoff } from "@/lib/providers/http";
import {
  discoverViaFacebookSearch,
  findEmailViaWebSearch,
  findFacebookPageViaWebSearch,
} from "@/lib/providers/brave-search.server";
import { probePage } from "@/lib/providers/page-probe.server";
import { isFacebookWebsiteUri } from "@/lib/providers/facebook-url";
import { ProviderAuthError, ProviderNotConfigured, type SearchProvider } from "./types";
import type {
  EmailResult,
  FacebookPageResult,
  ProviderCursor,
  RawBusiness,
  SearchPage,
} from "./types";
import type { SearchCriteria } from "@/lib/search-criteria";
import { zipToCentroid, milesToMeters } from "@/data/geo";
import { resolveCategory } from "@/lib/categories";

const PLACES_BASE_URL = "https://places.googleapis.com/v1/places";
const PAGE_SIZE = 20;

/** See searchBusinesses — signals "switch from :searchNearby to :searchText now", not a real Places token. */
const SEARCH_TEXT_FALLBACK = "__search_text_fallback__";
/** See searchBusinesses — signals "switch to the site:facebook.com discovery pass now". */
const FACEBOOK_SEARCH_FALLBACK = "__facebook_search_fallback__";
/**
 * Signals "the previous category's whole 3-stage chain is exhausted — restart
 * it from stage 1 for the next category in the queue," not a real Places
 * token. Google Places' :searchText is a relevance ranker over one phrase, not
 * a boolean query engine — "Restaurants or Bakeries near X" was tried and in
 * practice just returns whichever category ranks higher, silently dropping
 * the other(s). Running each selected category as its own full search (and
 * concatenating the pages) is the only way multi-category search actually
 * covers every category, so `criteria.category`'s comma-joined labels are
 * queued here and worked through one at a time across chunks.
 */
const CATEGORY_ADVANCE = "__category_advance__";
/** Caps the Places lookup calls the Facebook-discovery pass can spend confirming candidate names. */
const MAX_FACEBOOK_LOOKUPS = 10;

/** `criteria.category`'s comma-joined labels, as an ordered queue — a blank/empty category is still a one-entry queue (no filter). */
function splitCategories(raw: string): string[] {
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.length > 0 ? tokens : [""];
}

const SEARCH_FIELD_MASK_COMMON = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
];

// :searchNearby's response has no `nextPageToken` field at all (unlike
// :searchText, which pages) — Places (New) rejects the *entire* request with
// a 400 INVALID_ARGUMENT if the field mask references a field that doesn't
// exist on the endpoint's response type, so the mask can't be shared as-is.
const SEARCH_TEXT_FIELD_MASK = [...SEARCH_FIELD_MASK_COMMON, "nextPageToken"].join(",");
const SEARCH_NEARBY_FIELD_MASK = SEARCH_FIELD_MASK_COMMON.join(",");

type PlaceAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type Place = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlaceAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
};

type SearchResponse = {
  places?: Place[];
  nextPageToken?: string;
};

function componentByType(
  components: PlaceAddressComponent[] | undefined,
  type: string,
): PlaceAddressComponent | null {
  return components?.find((c) => c.types?.includes(type)) ?? null;
}

/** Turn one Places API result into this app's provider-neutral shape. Pure — unit-testable. */
export function mapPlaceToRawBusiness(place: Place, categoryHint: string): RawBusiness {
  const city = componentByType(place.addressComponents, "locality")?.longText ?? "";
  const county =
    componentByType(place.addressComponents, "administrative_area_level_2")?.longText ?? "";
  const state =
    componentByType(place.addressComponents, "administrative_area_level_1")?.shortText ?? "";
  const zip = componentByType(place.addressComponents, "postal_code")?.longText ?? "";

  return {
    providerId: place.id ?? "",
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    city,
    county,
    state,
    zip,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    phone: place.internationalPhoneNumber ?? null,
    category: place.primaryTypeDisplayName?.text || categoryHint,
    // Never assumed to be an independent website — verification.ts decides
    // what this field means, including the facebook.com special case.
    websiteUri: place.websiteUri ?? null,
    listingUrl: place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : null,
  };
}

export { isFacebookWebsiteUri };

/**
 * `criteria.category` can hold several comma-joined labels now (the Find
 * Leads form's category picker supports multi-select) — resolve each token
 * on its own and join with "or" so the natural-language query reads as a
 * real either/or rather than a single garbled phrase.
 */
function categoryQueryText(raw: string): string {
  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return resolveCategory("").label;
  return tokens.map((t) => resolveCategory(t).label).join(" or ");
}

/** The text query sent to `:searchText` for the two criteria modes with no real center point. */
export function textQueryFor(criteria: SearchCriteria): string {
  const category = categoryQueryText(criteria.category);
  switch (criteria.searchType) {
    case "zip_radius":
      return `${category} near ${criteria.zip}`;
    case "area_code":
      return criteria.city
        ? `${category} in ${criteria.city}, ${criteria.state || ""}`.trim()
        : category;
    case "state_county":
      return `${category} in ${criteria.city || criteria.county}, ${criteria.state}`;
  }
}

export function createGooglePlacesProvider(): SearchProvider {
  const envKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!envKey) {
    const unavailable = (): never => {
      throw new ProviderNotConfigured("google_places");
    };
    return {
      name: "google_places",
      available: false,
      searchBusinesses: unavailable,
      findFacebookPage: unavailable,
      findPublicEmail: unavailable,
      findPotentialWebsite: unavailable,
      verifyWebsite: unavailable,
    };
  }

  const apiKey: string = envKey;

  async function callPlaces(
    endpoint: "searchText" | "searchNearby",
    body: object,
  ): Promise<SearchResponse> {
    const response = await fetchWithBackoff(
      "google_places",
      `${PLACES_BASE_URL}:${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            endpoint === "searchNearby" ? SEARCH_NEARBY_FIELD_MASK : SEARCH_TEXT_FIELD_MASK,
        },
        body: JSON.stringify(body),
      },
      { maxRetries: 2 },
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ProviderAuthError("google_places");
      }
      throw new Error(`Google Places API returned ${response.status}`);
    }
    return (await response.json()) as SearchResponse;
  }

  return {
    name: "google_places",
    available: true,

    async searchBusinesses(criteria, cursor: ProviderCursor): Promise<SearchPage> {
      // Several categories run as entirely separate searches, one at a time
      // across chunks — see CATEGORY_ADVANCE for why. The queue is computed
      // once (from criteria.category) and persisted in the cursor from then on.
      const categoryQueue = cursor.categoryQueue ?? splitCategories(criteria.category);
      const categoryIndex = cursor.categoryIndex ?? 0;
      const currentCategory = categoryQueue[categoryIndex] ?? "";
      const categoryHint = resolveCategory(currentCategory).label;
      // The chain below reasons about "this category's own stage progress" —
      // a CATEGORY_ADVANCE cursor means the previous category just finished,
      // so this category's chain hasn't started yet (same as cursor={}).
      const chainPageToken = cursor.pageToken === CATEGORY_ADVANCE ? undefined : cursor.pageToken;
      const singleCategoryCriteria = { ...criteria, category: currentCategory } as SearchCriteria;

      // A three-stage discovery chain, chained entirely through sentinel
      // "page tokens" that are never real Places tokens — each stage's
      // completion signals which stage runs next:
      //
      //   1. :searchNearby (zip_radius only) — one page, no pagination of
      //      its own at all. -> SEARCH_TEXT_FALLBACK
      //   2. :searchText, paginated for real via Places' own tokens, until
      //      it genuinely runs out. -> FACEBOOK_SEARCH_FALLBACK
      //   3. A `site:facebook.com` Brave web search for businesses Places'
      //      own search missed or ranked low, each looked up for real via
      //      Places (by name) to get an authoritative record before it's
      //      treated as a genuine candidate. One-shot -> CATEGORY_ADVANCE (or
      //      null if this was the last category in the queue).
      //
      // Stage 3 exists because Places' own ranking/coverage sometimes just
      // doesn't surface a business that would otherwise qualify — see
      // brave-search.server.ts's discoverViaFacebookSearch for the
      // compliance boundary (never fetches Facebook, only Brave's own
      // already-indexed results).
      const nearby =
        criteria.searchType === "zip_radius" && !chainPageToken
          ? (() => {
              const center = zipToCentroid(criteria.zip);
              return center ? { center, radiusMiles: criteria.radiusMiles } : null;
            })()
          : null;

      let businesses: RawBusiness[];
      let chainNextPageToken: string | null;

      if (nearby) {
        const response = await callPlaces("searchNearby", {
          includedTypes: [],
          maxResultCount: PAGE_SIZE,
          locationRestriction: {
            circle: {
              center: { latitude: nearby.center.lat, longitude: nearby.center.lng },
              radius: Math.min(milesToMeters(nearby.radiusMiles), 50_000),
            },
          },
        });
        businesses = (response.places ?? []).map((p) => mapPlaceToRawBusiness(p, categoryHint));
        chainNextPageToken = SEARCH_TEXT_FALLBACK;
      } else if (chainPageToken === FACEBOOK_SEARCH_FALLBACK) {
        const candidates = await discoverViaFacebookSearch(textQueryFor(singleCategoryCriteria));
        businesses = [];
        for (const candidate of candidates.slice(0, MAX_FACEBOOK_LOOKUPS)) {
          const lookup = await callPlaces("searchText", {
            textQuery: `${candidate.name} ${textQueryFor(singleCategoryCriteria)}`,
          });
          const first = lookup.places?.[0];
          if (first) businesses.push(mapPlaceToRawBusiness(first, categoryHint));
        }
        chainNextPageToken = null; // one-shot — nothing left to chain to after this
      } else {
        const pageToken =
          chainPageToken && chainPageToken !== SEARCH_TEXT_FALLBACK ? chainPageToken : undefined;
        const response = await callPlaces("searchText", {
          textQuery: textQueryFor(singleCategoryCriteria),
          pageToken,
        });
        businesses = (response.places ?? []).map((p) => mapPlaceToRawBusiness(p, categoryHint));
        chainNextPageToken = response.nextPageToken ?? FACEBOOK_SEARCH_FALLBACK;
      }

      // This category's own chain just finished — move on to the next one in
      // the queue (restarting its chain from stage 1), or finish for real if
      // that was the last one.
      let nextPageToken: string | null;
      let nextCategoryIndex = categoryIndex;
      if (chainNextPageToken === null && categoryIndex + 1 < categoryQueue.length) {
        nextPageToken = CATEGORY_ADVANCE;
        nextCategoryIndex = categoryIndex + 1;
      } else {
        nextPageToken = chainNextPageToken;
      }

      return {
        businesses,
        nextPageToken,
        calls: 1,
        cursorPatch: { categoryQueue, categoryIndex: nextCategoryIndex },
      };
    },

    async findFacebookPage(business): Promise<FacebookPageResult> {
      // Places' own websiteUri pointing at facebook.com is the strongest
      // signal — an explicit claim from the business's own listing.
      if (isFacebookWebsiteUri(business.websiteUri)) {
        return { url: business.websiteUri, source: "provider", profileListsWebsite: null };
      }
      // Places has no dedicated "does this business have a Facebook page"
      // field, and if it lists a real independent website, this business
      // isn't this app's target lead type anyway. But when Places has no
      // website on file at all, that's exactly the case worth checking
      // further — fall back to a Brave web search for a facebook.com URL
      // in the public results (never fetched, same as the email fallback;
      // never Facebook itself). Without this, a business with no website
      // could never be confirmed as having a Facebook page at all, and so
      // could never qualify — Places alone has no way to tell us.
      if (!business.websiteUri) {
        const url = await findFacebookPageViaWebSearch({
          name: business.name,
          city: business.city,
          state: business.state,
        });
        if (url) return { url, source: "search_name", profileListsWebsite: null };
      }
      return { url: null, source: "provider", profileListsWebsite: null };
    },

    async findPublicEmail(business): Promise<EmailResult> {
      // Places (New) has no email field of its own. A business with its own
      // independent website is already outside this app's target lead type
      // (it's excluded from "qualified" regardless), so the web-search
      // fallback is scoped to the no-website case it actually matters for —
      // never Facebook, and never a guess. A no-op when Brave isn't
      // configured.
      if (business.websiteUri && !isFacebookWebsiteUri(business.websiteUri)) {
        return { email: null, status: "not_found", source: "email_domain" };
      }
      const email = await findEmailViaWebSearch({
        name: business.name,
        city: business.city,
        state: business.state,
      });
      return email
        ? { email, status: "publicly_listed", source: "search_name" }
        : { email: null, status: "not_found", source: "email_domain" };
    },

    async findPotentialWebsite(business) {
      if (!business.websiteUri || isFacebookWebsiteUri(business.websiteUri)) return [];
      return [
        {
          url: business.websiteUri,
          source: "provider" as const,
          reachable: null,
          pageTitle: null,
          pageText: null,
        },
      ];
    },

    async verifyWebsite(url) {
      return probePage("google_places", url);
    },
  };
}
