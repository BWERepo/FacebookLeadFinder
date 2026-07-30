import type { ExcludedDomainKind } from "@/lib/domain";

/**
 * The built-in catalogue of domains that are never a business's own website.
 *
 * This is the same list that
 * supabase/migrations/20260801001000_seed_reference_data.sql inserts into
 * public.excluded_domains — the migration is the editable copy a user can add
 * to or disable entries in; this is the copy the pure verification logic uses,
 * so `classifyWebsite` can run in a unit test with no database.
 *
 * `excluded-domains.test.ts` asserts the two stay identical. Add an entry to
 * both or neither.
 */

export type CatalogEntry = {
  domain: string;
  kind: ExcludedDomainKind;
  note: string;
};

export const EXCLUDED_DOMAIN_CATALOG: readonly CatalogEntry[] = [
  // --- Facebook itself -----------------------------------------------------
  // Classified rather than merely blocked: the verification logic needs to tell
  // "this is their Facebook page" (the thing we are looking for) apart from
  // "this is some other social profile".
  { domain: "facebook.com", kind: "facebook", note: "The page we are looking for, not a website" },
  { domain: "fb.com", kind: "facebook", note: "Facebook short domain" },
  { domain: "fb.me", kind: "facebook", note: "Facebook short link" },
  { domain: "facebook.net", kind: "facebook", note: "Facebook infrastructure domain" },

  // --- Other social profiles ----------------------------------------------
  { domain: "instagram.com", kind: "other_social", note: "Social profile" },
  { domain: "linkedin.com", kind: "other_social", note: "Social profile" },
  { domain: "tiktok.com", kind: "other_social", note: "Social profile" },
  { domain: "x.com", kind: "other_social", note: "Social profile" },
  { domain: "twitter.com", kind: "other_social", note: "Social profile" },
  { domain: "pinterest.com", kind: "other_social", note: "Social profile" },
  { domain: "youtube.com", kind: "other_social", note: "Social profile" },
  { domain: "nextdoor.com", kind: "other_social", note: "Neighbourhood social network" },
  { domain: "snapchat.com", kind: "other_social", note: "Social profile" },

  // --- Directories and review sites ---------------------------------------
  { domain: "yelp.com", kind: "directory", note: "Review directory" },
  { domain: "yellowpages.com", kind: "directory", note: "Business directory" },
  { domain: "yp.com", kind: "directory", note: "Business directory" },
  { domain: "mapquest.com", kind: "directory", note: "Map directory" },
  { domain: "bbb.org", kind: "directory", note: "Better Business Bureau listing" },
  { domain: "angi.com", kind: "directory", note: "Home services directory" },
  { domain: "angieslist.com", kind: "directory", note: "Home services directory" },
  { domain: "homeadvisor.com", kind: "directory", note: "Home services directory" },
  { domain: "thumbtack.com", kind: "directory", note: "Home services directory" },
  { domain: "manta.com", kind: "directory", note: "Business directory" },
  { domain: "chamberofcommerce.com", kind: "directory", note: "Chamber of Commerce directory" },
  { domain: "superpages.com", kind: "directory", note: "Business directory" },
  { domain: "citysearch.com", kind: "directory", note: "Business directory" },
  { domain: "foursquare.com", kind: "directory", note: "Location directory" },
  { domain: "tripadvisor.com", kind: "directory", note: "Review directory" },
  { domain: "opentable.com", kind: "directory", note: "Restaurant booking directory" },
  { domain: "alignable.com", kind: "directory", note: "Small business network" },
  { domain: "birdeye.com", kind: "directory", note: "Reputation directory" },
  { domain: "merchantcircle.com", kind: "directory", note: "Business directory" },

  // --- Google Business Profile surfaces ------------------------------------
  { domain: "business.site", kind: "google_business", note: "Google Business Profile site" },
  { domain: "g.page", kind: "google_business", note: "Google Business Profile short link" },
  { domain: "sites.google.com", kind: "google_business", note: "Google Sites page" },

  // --- Marketplace storefronts ---------------------------------------------
  { domain: "square.site", kind: "marketplace", note: "Square storefront" },
  { domain: "etsy.com", kind: "marketplace", note: "Etsy shop" },
  { domain: "ecwid.com", kind: "marketplace", note: "Hosted storefront" },
  { domain: "bigcartel.com", kind: "marketplace", note: "Hosted storefront" },
  { domain: "storenvy.com", kind: "marketplace", note: "Hosted storefront" },
  { domain: "ebay.com", kind: "marketplace", note: "Marketplace storefront" },
  { domain: "amazon.com", kind: "marketplace", note: "Marketplace storefront" },
  { domain: "linktr.ee", kind: "marketplace", note: "Link-in-bio page, not a website" },
  { domain: "shopmy.us", kind: "marketplace", note: "Link-in-bio storefront" },
  { domain: "beacons.ai", kind: "marketplace", note: "Link-in-bio page" },

  // --- Booking and ordering platforms --------------------------------------
  { domain: "doordash.com", kind: "marketplace", note: "Ordering platform listing" },
  { domain: "grubhub.com", kind: "marketplace", note: "Ordering platform listing" },
  { domain: "ubereats.com", kind: "marketplace", note: "Ordering platform listing" },
  { domain: "booksy.com", kind: "marketplace", note: "Booking platform listing" },
  { domain: "vagaro.com", kind: "marketplace", note: "Booking platform listing" },
  { domain: "styleseat.com", kind: "marketplace", note: "Booking platform listing" },
] as const;

/**
 * Exclusions that need a path, not just a host.
 *
 * `google.com` is not excludable — a business could plausibly be hosted on some
 * google.com path, and more importantly excluding the whole domain would be
 * wrong. But `google.com/maps/...` is definitely a listing, not a website.
 * Same story for a shop *inside* a marketplace whose bare domain we do not want
 * to blanket-exclude.
 *
 * `pattern` is matched against the normalized host + path.
 */
export type PathExclusion = {
  host: string;
  pathPrefix: string;
  kind: ExcludedDomainKind;
  note: string;
};

export const EXCLUDED_PATH_PATTERNS: readonly PathExclusion[] = [
  {
    host: "google.com",
    pathPrefix: "/maps",
    kind: "google_business",
    note: "Google Maps listing",
  },
  {
    host: "google.com",
    pathPrefix: "/search",
    kind: "google_business",
    note: "Google search result",
  },
  {
    host: "sites.google.com",
    pathPrefix: "/view",
    kind: "google_business",
    note: "Google Sites page",
  },
  {
    host: "amazon.com",
    pathPrefix: "/stores",
    kind: "marketplace",
    note: "Amazon storefront",
  },
  {
    host: "etsy.com",
    pathPrefix: "/shop",
    kind: "marketplace",
    note: "Etsy shop",
  },
  {
    host: "ebay.com",
    pathPrefix: "/str",
    kind: "marketplace",
    note: "eBay store",
  },
] as const;
