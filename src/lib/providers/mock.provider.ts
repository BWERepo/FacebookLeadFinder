/**
 * The mock provider. Zero network calls, fully deterministic, always
 * available — this is what makes the whole application runnable with no paid
 * API and no credentials, and what every test in Phase 5 and 6 runs against.
 *
 * "Deterministic" means the same criteria always produce the same businesses:
 * results are drawn from a small fictional pool (also used by the Phase 7 demo
 * seeder) filtered by the search criteria's location, then padded out with
 * procedurally generated variants seeded from the criteria itself, so
 * `maxResults` is always satisfiable without the pool needing to be huge.
 *
 * The pool is engineered, not random, to guarantee every verification branch
 * gets exercised in a normal test run: an FB-only qualified lead, a business
 * with a real website, a Yelp-only listing, a marketplace storefront, a
 * duplicate pair, a no-email business, and an unreachable-candidate case are
 * all present for the ZIP 37902 (Knoxville) area used throughout Phase 7's
 * seed data.
 */

import type { CandidateUrl } from "@/lib/verification";
import type { EmailStatus } from "@/lib/domain";
import type { SearchCriteria } from "@/lib/search-criteria";
import { normalizeBusinessName } from "@/lib/dedupe";
import type {
  EmailResult,
  FacebookPageResult,
  ProviderCursor,
  RawBusiness,
  SearchPage,
  SearchProvider,
  VerifyResult,
} from "./types";

// ---------------------------------------------------------------------------
// The fixed pool — hand-built businesses, one per verification branch.
// ---------------------------------------------------------------------------

type MockBusiness = RawBusiness & {
  /** Pre-scripted outcome, so the pool exercises every branch predictably. */
  scenario:
    | "facebook_only"
    | "has_website"
    | "directory_only"
    | "marketplace"
    | "no_email"
    | "unreachable_candidate"
    | "duplicate_pair";
  facebookUrl: string | null;
  email: string | null;
  emailStatus: EmailStatus;
};

const KNOXVILLE_POOL: readonly MockBusiness[] = [
  {
    providerId: "mock-001",
    name: "Bergstrom Hydronics",
    address: "412 Depot Ave",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37902",
    latitude: 35.9631,
    longitude: -83.9234,
    phone: "(865) 555-0142",
    category: "HVAC companies",
    websiteUri: null,
    listingUrl: "https://maps.example/mock-001",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/BergstromHydronics",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "mock-002",
    name: "Rosalita's Taqueria",
    address: "88 Market Sq",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37902",
    latitude: 35.9647,
    longitude: -83.9198,
    phone: "(865) 555-0177",
    category: "Restaurants",
    websiteUri: "https://rosalitastaqueria.com",
    listingUrl: "https://maps.example/mock-002",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/RosalitasTaqueria",
    email: "hello@rosalitastaqueria.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "mock-003",
    name: "Shear Genius Salon",
    address: "215 Union Ave",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37909",
    latitude: 35.9328,
    longitude: -84.0007,
    phone: "(865) 555-0193",
    category: "Hair salons",
    websiteUri: null,
    listingUrl: "https://maps.example/mock-003",
    scenario: "directory_only",
    facebookUrl: "https://facebook.com/ShearGeniusKnox",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "mock-004",
    name: "Suzi's Handmade Crafts",
    address: "77 Gay St",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37902",
    latitude: 35.9662,
    longitude: -83.9188,
    phone: "(865) 555-0161",
    category: "Craft businesses",
    websiteUri: "https://suzishandmade.square.site",
    listingUrl: "https://maps.example/mock-004",
    scenario: "marketplace",
    facebookUrl: "https://facebook.com/SuzisHandmadeCrafts",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "mock-005",
    name: "Ridgeline Roofing Co",
    address: "1900 Sutherland Ave",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37919",
    latitude: 35.9187,
    longitude: -83.9635,
    phone: "(865) 555-0128",
    category: "Contractors",
    websiteUri: null,
    listingUrl: "https://maps.example/mock-005",
    scenario: "no_email",
    facebookUrl: "https://facebook.com/RidgelineRoofingTN",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "mock-006",
    name: "Copperline Electric",
    address: "500 Henley St",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37902",
    latitude: 35.9598,
    longitude: -83.9219,
    phone: "(865) 555-0155",
    category: "Electricians",
    websiteUri: "https://copperline-electric.net",
    listingUrl: "https://maps.example/mock-006",
    scenario: "unreachable_candidate",
    facebookUrl: "https://facebook.com/CopperlineElectric",
    email: "office@copperline-electric.net",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "mock-007",
    name: "Bergstrom Hydronics LLC",
    address: "412 Depot Avenue",
    city: "Knoxville",
    county: "Knox",
    state: "TN",
    zip: "37902",
    latitude: 35.9631,
    longitude: -83.9234,
    phone: "865.555.0142",
    category: "HVAC companies",
    websiteUri: null,
    listingUrl: "https://maps.example/mock-007",
    // Deliberately near-identical to mock-001 (same phone, near-identical
    // name) so a search that discovers both exercises the dedupe path.
    scenario: "duplicate_pair",
    facebookUrl: "https://facebook.com/BergstromHydronics",
    email: null,
    emailStatus: "not_found",
  },
] as const;

// ---------------------------------------------------------------------------
// Deterministic padding — same criteria always yields the same extra rows.
// ---------------------------------------------------------------------------

/** A small xorshift-style PRNG seeded from a string, so results are stable across runs. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const GENERATED_NAME_PARTS = {
  adjectives: ["Blue Ridge", "Volunteer", "Summit", "Riverside", "Heritage", "Foothills"],
  nouns: ["Plumbing", "Auto Repair", "Cleaning", "Landscaping", "Dental", "Bakery"],
};

function categoryToGeneratedNoun(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("plumb")) return "Plumbing";
  if (c.includes("auto")) return "Auto Repair";
  if (c.includes("clean")) return "Cleaning";
  if (c.includes("landscap")) return "Landscaping";
  if (c.includes("dental") || c.includes("dentist")) return "Dental";
  if (c.includes("bak")) return "Bakery";
  return GENERATED_NAME_PARTS.nouns[0];
}

/**
 * Location for a generated business, honouring whatever the search asked for
 * rather than always stamping Knoxville. The pool itself is Knoxville-only, so
 * for a search that plainly isn't about Knoxville (a different state, or an
 * area code that isn't 865), the padding needs to at least be consistent with
 * the criteria — a CA county search that silently returns TN addresses would
 * be a believable-looking but wrong result, which is worse than an obviously
 * synthetic one.
 */
function generatedLocation(criteria: SearchCriteria): {
  city: string;
  county: string;
  state: string;
  zip: string;
  areaCode: string;
} {
  switch (criteria.searchType) {
    case "zip_radius":
      return { city: "Knoxville", county: "Knox", state: "TN", zip: criteria.zip, areaCode: "865" };
    case "area_code":
      return {
        city: criteria.city || "Knoxville",
        county: "Knox",
        state: criteria.state || "TN",
        zip: "37902",
        areaCode: criteria.areaCode,
      };
    case "state_county":
      return {
        city: criteria.city || "Countyseat",
        county: criteria.county,
        state: criteria.state,
        zip: "37902",
        areaCode: "865",
      };
  }
}

function generateBusiness(
  index: number,
  rand: () => number,
  criteria: SearchCriteria,
): MockBusiness {
  const adjective =
    GENERATED_NAME_PARTS.adjectives[Math.floor(rand() * GENERATED_NAME_PARTS.adjectives.length)];
  const noun = criteria.category
    ? categoryToGeneratedNoun(criteria.category)
    : GENERATED_NAME_PARTS.nouns[Math.floor(rand() * GENERATED_NAME_PARTS.nouns.length)];
  const name = `${adjective} ${noun}`;
  const location = generatedLocation(criteria);
  const phone = `(${location.areaCode}) 555-${String(1000 + Math.floor(rand() * 8999)).slice(0, 4)}`;

  // Alternate between the two most common honest outcomes so a large result
  // set still looks like real search results rather than one repeated shape.
  const isQualifying = index % 2 === 0;

  return {
    providerId: `mock-gen-${index}`,
    name,
    address: `${100 + index} Generated St`,
    city: location.city,
    county: location.county,
    state: location.state,
    zip: location.zip,
    latitude: 35.96 + (rand() - 0.5) * 0.05,
    longitude: -83.92 + (rand() - 0.5) * 0.05,
    phone,
    category: criteria.category || "Other",
    websiteUri: isQualifying
      ? null
      : `https://${normalizeBusinessName(name).replace(/\s+/g, "")}.com`,
    listingUrl: `https://maps.example/mock-gen-${index}`,
    scenario: isQualifying ? "facebook_only" : "has_website",
    // Deliberately not a plausible vanity slug like facebook.com/BlueRidgeBakery
    // — the generated name pool is a small, generic set of real-sounding
    // adjective/noun combos ("Blue Ridge Bakery", "Summit Dental", ...) that
    // can and does collide with an actual claimed page for an unrelated real
    // business. `profile.php?id=` is Facebook's numeric-ID URL form; a
    // synthetic ID keyed off the mock index can't collide with anything real.
    facebookUrl: `https://facebook.com/profile.php?id=61${String(index).padStart(13, "0")}`,
    email: null,
    emailStatus: "not_found",
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const PAGE_SIZE = 4;

function criteriaKey(criteria: SearchCriteria): string {
  switch (criteria.searchType) {
    case "zip_radius":
      return `zip:${criteria.zip}:${criteria.radiusMiles}:${criteria.category}`;
    case "area_code":
      return `area:${criteria.areaCode}:${criteria.city}:${criteria.state}:${criteria.category}`;
    case "state_county":
      return `county:${criteria.state}:${criteria.county}:${criteria.city}:${criteria.category}`;
  }
}

function matchesLocation(business: MockBusiness, criteria: SearchCriteria): boolean {
  switch (criteria.searchType) {
    case "zip_radius":
      // The mock pool is small and single-metro; treat every pool member as
      // "within range" so any Knoxville-area ZIP returns the full pool. Real
      // radius filtering is exercised against the real geo math in
      // src/data/geo.test.ts, not re-simulated here.
      return true;
    case "area_code":
      return business.phone?.replace(/\D/g, "").startsWith(criteria.areaCode) ?? false;
    case "state_county":
      return (
        business.state === criteria.state &&
        (criteria.county === "" || business.county.toLowerCase() === criteria.county.toLowerCase())
      );
  }
}

function matchesCategory(business: MockBusiness, criteria: SearchCriteria): boolean {
  if (!criteria.category) return true;
  return business.category.toLowerCase().includes(criteria.category.toLowerCase());
}

export function createMockProvider(): SearchProvider {
  return {
    name: "mock",
    available: true,

    async searchBusinesses(criteria, cursor: ProviderCursor): Promise<SearchPage> {
      const pageIndex = cursor.pageToken ? Number.parseInt(cursor.pageToken, 10) : 0;
      const fromPool = KNOXVILLE_POOL.filter(
        (b) => matchesLocation(b, criteria) && matchesCategory(b, criteria),
      );

      const rand = seededRandom(`${criteriaKey(criteria)}:${pageIndex}`);
      const generatedNeeded = Math.max(0, PAGE_SIZE - (pageIndex === 0 ? fromPool.length : 0));
      const generated = Array.from({ length: generatedNeeded }, (_, i) =>
        generateBusiness(pageIndex * PAGE_SIZE + i, rand, criteria),
      );

      const businesses = pageIndex === 0 ? [...fromPool, ...generated] : generated;

      // A bounded number of pages keeps a runaway maxResults from looping
      // forever against a criteria the pool can't satisfy meaningfully.
      const MAX_PAGES = 25;
      const nextPageToken = pageIndex + 1 < MAX_PAGES ? String(pageIndex + 1) : null;

      return { businesses, nextPageToken, calls: 1 };
    },

    async findFacebookPage(business): Promise<FacebookPageResult> {
      const mock = business as MockBusiness;
      return {
        url: mock.facebookUrl ?? null,
        source: "facebook_profile",
        profileListsWebsite: mock.facebookUrl ? mock.scenario === "has_website" : null,
      };
    },

    async findPublicEmail(business): Promise<EmailResult> {
      const mock = business as MockBusiness;
      // Never constructs an address — only returns what the fixture already
      // has recorded as "published", exactly mirroring the real-provider
      // contract in types.ts.
      return { email: mock.email, status: mock.emailStatus, source: "email_domain" };
    },

    async findPotentialWebsite(business): Promise<CandidateUrl[]> {
      const mock = business as MockBusiness;
      const candidates: CandidateUrl[] = [];

      if (mock.scenario === "directory_only") {
        candidates.push({
          url: `https://www.yelp.com/biz/${normalizeBusinessName(mock.name).replace(/\s+/g, "-")}`,
          source: "directory",
          reachable: true,
          pageTitle: `${mock.name} - Yelp`,
          pageText: `${mock.name}, ${mock.city}, ${mock.state} ${mock.zip}. ${mock.phone}`,
        });
      }

      if (mock.websiteUri) {
        const reachable = mock.scenario !== "unreachable_candidate";
        candidates.push({
          url: mock.websiteUri,
          source: "provider",
          reachable,
          // No page content for a site that never responded — see the
          // matching comment in verifyWebsite.
          pageTitle: reachable ? mock.name : null,
          pageText: reachable
            ? `${mock.name}. Call us at ${mock.phone}. ${mock.address}, ${mock.city}, ${mock.state} ${mock.zip}.`
            : null,
        });
      }

      return candidates;
    },

    async verifyWebsite(url): Promise<VerifyResult> {
      const match = KNOXVILLE_POOL.find((b) => b.websiteUri === url);
      if (!match) return { reachable: true, pageTitle: null, pageText: null };

      const reachable = match.scenario !== "unreachable_candidate";
      // An unreachable site yields no page content — there is nothing to
      // scrape from a connection that failed. Reporting text anyway would let
      // domain/phone/location matches accumulate points for a page that was
      // never actually read.
      if (!reachable) return { reachable, pageTitle: null, pageText: null };

      return {
        reachable,
        pageTitle: match.name,
        pageText: `${match.name}. Call us at ${match.phone}. ${match.address}, ${match.city}, ${match.state} ${match.zip}.`,
      };
    },
  };
}

/** Exposed for the Phase 7 demo seeder, which shares this exact fixture pool. */
export { KNOXVILLE_POOL as MOCK_BUSINESS_POOL };
export type { MockBusiness };
