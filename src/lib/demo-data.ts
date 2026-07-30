/**
 * Phase 7 — seeded demo data.
 *
 * Runs a fixed, hand-built set of fictional businesses through the exact same
 * pure verification pipeline (`classifyWebsite` + `scoreConfidence`) the real
 * search pipeline uses in `searches.functions.ts`, so a demo lead's status,
 * qualification, and confidence score are never hand-typed guesses — they are
 * the same computed result a real search would produce for a business with
 * that scenario. This is what lets the whole app be explored with zero paid
 * APIs: load demo data, and the leads table, dashboard, and export all show
 * real, self-consistent data.
 *
 * `MOCK_BUSINESS_POOL` (the mock search provider's fixed 7-business Knoxville
 * pool) is reused here rather than duplicated, plus `ADDITIONAL_DEMO_BUSINESSES`
 * spreads the rest of the set across other seeded metros/categories so the
 * data set isn't single-city — useful once Phase 8's dashboard charts by
 * state/category exist.
 *
 * This module is pure — no Supabase, no I/O — so it can be unit tested like
 * every other file in src/lib/. The server functions that call it live in
 * demo-data.functions.ts.
 */

import { MOCK_BUSINESS_POOL, type MockBusiness } from "@/lib/providers/mock.provider";
import { resolveCategory } from "@/lib/categories";
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeEmail,
  normalizeFacebookUrl,
  normalizePhone,
} from "@/lib/dedupe";
import { emailDomain } from "@/lib/url";
import { classifyWebsite, type CandidateUrl } from "@/lib/verification";
import { scoreConfidence } from "@/lib/confidence";

// ---------------------------------------------------------------------------
// The additional fictional pool — spread across metros other than Knoxville.
// ---------------------------------------------------------------------------

export const ADDITIONAL_DEMO_BUSINESSES: readonly MockBusiness[] = [
  {
    providerId: "demo-101",
    name: "Peachtree Auto Care",
    address: "210 Marietta St",
    city: "Atlanta",
    county: "Fulton",
    state: "GA",
    zip: "30303",
    latitude: 33.7537,
    longitude: -84.3863,
    phone: "(404) 555-0111",
    category: "Auto repair",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-101",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/PeachtreeAutoCare",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-102",
    name: "Mile High Plumbing",
    address: "1600 Larimer St",
    city: "Denver",
    county: "Denver",
    state: "CO",
    zip: "80202",
    latitude: 39.7508,
    longitude: -104.9963,
    phone: "(303) 555-0122",
    category: "Plumbers",
    websiteUri: "https://milehighplumbingco.com",
    listingUrl: "https://maps.example/demo-102",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/MileHighPlumbing",
    email: "service@milehighplumbingco.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-103",
    name: "Queen City Smiles Dentistry",
    address: "301 S Tryon St",
    city: "Charlotte",
    county: "Mecklenburg",
    state: "NC",
    zip: "28202",
    latitude: 35.2271,
    longitude: -80.8431,
    phone: "(704) 555-0133",
    category: "Dentists",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-103",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/QueenCitySmiles",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-104",
    name: "Music City Realty Group",
    address: "150 4th Ave N",
    city: "Nashville",
    county: "Davidson",
    state: "TN",
    zip: "37201",
    latitude: 36.1662,
    longitude: -86.7744,
    phone: "(615) 555-0144",
    category: "Real estate agents",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-104",
    scenario: "directory_only",
    facebookUrl: "https://facebook.com/MusicCityRealtyGroup",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-105",
    name: "Scenic City Photography",
    address: "800 Market St",
    city: "Chattanooga",
    county: "Hamilton",
    state: "TN",
    zip: "37402",
    latitude: 35.0456,
    longitude: -85.3097,
    phone: "(423) 555-0155",
    category: "Photographers",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-105",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/ScenicCityPhotography",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-106",
    name: "Blue Ridge Bakehouse",
    address: "12 Biltmore Ave",
    city: "Asheville",
    county: "Buncombe",
    state: "NC",
    zip: "28801",
    latitude: 35.5951,
    longitude: -82.5515,
    phone: "(828) 555-0166",
    category: "Bakeries",
    websiteUri: "https://blueridgebakehouse.square.site",
    listingUrl: "https://maps.example/demo-106",
    scenario: "marketplace",
    facebookUrl: "https://facebook.com/BlueRidgeBakehouse",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-107",
    name: "Flatiron Landscaping",
    address: "1300 Pearl St",
    city: "Boulder",
    county: "Boulder",
    state: "CO",
    zip: "80301",
    latitude: 40.0274,
    longitude: -105.2519,
    phone: "(303) 555-0177",
    category: "Landscaping companies",
    websiteUri: "https://flatironlandscaping.net",
    listingUrl: "https://maps.example/demo-107",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/FlatironLandscaping",
    email: "info@flatironlandscaping.net",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-108",
    name: "Desert Bloom Cleaning Services",
    address: "100 N Central Ave",
    city: "Phoenix",
    county: "Maricopa",
    state: "AZ",
    zip: "85004",
    latitude: 33.4519,
    longitude: -112.0709,
    phone: "(602) 555-0188",
    category: "Cleaning services",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-108",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/DesertBloomCleaning",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-109",
    name: "Old Town Retail Co",
    address: "4343 N Scottsdale Rd",
    city: "Scottsdale",
    county: "Maricopa",
    state: "AZ",
    zip: "85251",
    latitude: 33.4942,
    longitude: -111.9261,
    phone: "(480) 555-0199",
    category: "Retail stores",
    websiteUri: "https://oldtownretailco.com",
    listingUrl: "https://maps.example/demo-109",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/OldTownRetailCo",
    email: "hello@oldtownretailco.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-110",
    name: "Old Pueblo Barbershop",
    address: "45 W Congress St",
    city: "Tucson",
    county: "Pima",
    state: "AZ",
    zip: "85701",
    latitude: 32.2226,
    longitude: -110.9747,
    phone: "(520) 555-0201",
    category: "Barbers",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-110",
    scenario: "no_email",
    facebookUrl: "https://facebook.com/OldPuebloBarbershop",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-111",
    name: "Emerald City HVAC",
    address: "1000 2nd Ave",
    city: "Seattle",
    county: "King",
    state: "WA",
    zip: "98101",
    latitude: 47.6101,
    longitude: -122.3344,
    phone: "(206) 555-0212",
    category: "HVAC companies",
    websiteUri: "https://emeraldcityhvac.com",
    listingUrl: "https://maps.example/demo-111",
    scenario: "unreachable_candidate",
    facebookUrl: "https://facebook.com/EmeraldCityHVAC",
    email: "office@emeraldcityhvac.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-112",
    name: "Rose City Electric",
    address: "1900 SW 4th Ave",
    city: "Portland",
    county: "Multnomah",
    state: "OR",
    zip: "97201",
    latitude: 45.5122,
    longitude: -122.6812,
    phone: "(503) 555-0223",
    category: "Electricians",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-112",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/RoseCityElectric",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-113",
    name: "Windy City Contractors",
    address: "233 S Wacker Dr",
    city: "Chicago",
    county: "Cook",
    state: "IL",
    zip: "60601",
    latitude: 41.8858,
    longitude: -87.6229,
    phone: "(312) 555-0234",
    category: "Contractors",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-113",
    scenario: "directory_only",
    facebookUrl: "https://facebook.com/WindyCityContractors",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-114",
    name: "Motor City Auto Repair",
    address: "1 Woodward Ave",
    city: "Detroit",
    county: "Wayne",
    state: "MI",
    zip: "48226",
    latitude: 42.3345,
    longitude: -83.0483,
    phone: "(313) 555-0245",
    category: "Auto repair",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-114",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/MotorCityAutoRepair",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-115",
    name: "Beantown Bakery",
    address: "1 Beacon St",
    city: "Boston",
    county: "Suffolk",
    state: "MA",
    zip: "02108",
    latitude: 42.3583,
    longitude: -71.0658,
    phone: "(617) 555-0256",
    category: "Bakeries",
    websiteUri: "https://beantownbakery.com",
    listingUrl: "https://maps.example/demo-115",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/BeantownBakery",
    email: "orders@beantownbakery.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-116",
    name: "Empire Home Services",
    address: "350 5th Ave",
    city: "New York",
    county: "New York",
    state: "NY",
    zip: "10001",
    latitude: 40.7506,
    longitude: -73.9972,
    phone: "(212) 555-0267",
    category: "Home services",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-116",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/EmpireHomeServices",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-117",
    name: "Golden Gate Craft Studio",
    address: "1 Ferry Building",
    city: "San Francisco",
    county: "San Francisco",
    state: "CA",
    zip: "94103",
    latitude: 37.7955,
    longitude: -122.3937,
    phone: "(415) 555-0278",
    category: "Craft businesses",
    websiteUri: "https://goldengatecraftstudio.square.site",
    listingUrl: "https://maps.example/demo-117",
    scenario: "marketplace",
    facebookUrl: "https://facebook.com/GoldenGateCraftStudio",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-118",
    name: "Sunshine State Landscaping",
    address: "100 S Orange Ave",
    city: "Orlando",
    county: "Orange",
    state: "FL",
    zip: "32801",
    latitude: 28.5411,
    longitude: -81.3792,
    phone: "(407) 555-0289",
    category: "Landscaping companies",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-118",
    scenario: "facebook_only",
    facebookUrl: "https://facebook.com/SunshineStateLandscaping",
    email: null,
    emailStatus: "not_found",
  },
  {
    providerId: "demo-119",
    name: "Magic City Cleaning Co",
    address: "1000 Brickell Ave",
    city: "Miami",
    county: "Miami-Dade",
    state: "FL",
    zip: "33130",
    latitude: 25.7663,
    longitude: -80.1994,
    phone: "(305) 555-0290",
    category: "Cleaning services",
    websiteUri: "https://magiccitycleaning.com",
    listingUrl: "https://maps.example/demo-119",
    scenario: "has_website",
    facebookUrl: "https://facebook.com/MagicCityCleaningCo",
    email: "book@magiccitycleaning.com",
    emailStatus: "publicly_listed",
  },
  {
    providerId: "demo-120",
    name: "Big Apple Hair Studio",
    address: "1 Times Square",
    city: "New York",
    county: "New York",
    state: "NY",
    zip: "10001",
    latitude: 40.7506,
    longitude: -73.9972,
    phone: "(212) 555-0301",
    category: "Hair salons",
    websiteUri: null,
    listingUrl: "https://maps.example/demo-120",
    scenario: "no_email",
    facebookUrl: "https://facebook.com/BigAppleHairStudio",
    email: null,
    emailStatus: "not_found",
  },
] as const;

/** The full demo set: the mock provider's Knoxville pool plus the metros above. 27 businesses in total. */
export const DEMO_BUSINESSES: readonly MockBusiness[] = [
  ...MOCK_BUSINESS_POOL,
  ...ADDITIONAL_DEMO_BUSINESSES,
];

// ---------------------------------------------------------------------------
// Running a fixture through the real verification pipeline
// ---------------------------------------------------------------------------

/**
 * Candidate URLs, built the same way the mock provider's `findPotentialWebsite`
 * + `verifyWebsite` would report them for this fixture — duplicated here
 * (rather than calling the provider) so this module stays pure and
 * synchronous; the provider's async shape exists only to satisfy the
 * `SearchProvider` interface real providers need.
 */
function buildCandidateUrls(business: MockBusiness): CandidateUrl[] {
  const candidates: CandidateUrl[] = [];

  if (business.scenario === "directory_only") {
    candidates.push({
      url: `https://www.yelp.com/biz/${normalizeBusinessName(business.name).replace(/\s+/g, "-")}`,
      source: "directory",
      reachable: true,
      pageTitle: `${business.name} - Yelp`,
      pageText: `${business.name}, ${business.city}, ${business.state} ${business.zip}. ${business.phone}`,
    });
  }

  if (business.websiteUri) {
    const reachable = business.scenario !== "unreachable_candidate";
    candidates.push({
      url: business.websiteUri,
      source: "provider",
      reachable,
      pageTitle: reachable ? business.name : null,
      pageText: reachable
        ? `${business.name}. Call us at ${business.phone}. ${business.address}, ${business.city}, ${business.state} ${business.zip}.`
        : null,
    });
  }

  return candidates;
}

/** A fully-verified lead row, ready to insert into `public.leads`. */
export function buildDemoLeadRow(
  business: MockBusiness,
  createdBy: string,
): Record<string, unknown> {
  const candidateUrls = buildCandidateUrls(business);
  const domain = business.email ? emailDomain(business.email) : null;

  const verification = classifyWebsite({
    business: {
      name: business.name,
      phone: business.phone,
      city: business.city,
      state: business.state,
      zip: business.zip,
    },
    facebookUrl: business.facebookUrl,
    facebookProfileListsWebsite: business.facebookUrl ? business.scenario === "has_website" : null,
    providerWebsiteUri: business.websiteUri,
    emailDomain: domain,
    candidateUrls,
    searchesAttempted: {
      byName: true,
      byPhone: true,
      byAddress: true,
      byEmailDomain: true,
      bySocial: Boolean(business.facebookUrl),
    },
  });
  const confidence = scoreConfidence(verification.signals, verification.status);
  const category = resolveCategory(business.category);
  const normalizedPhone = normalizePhone(business.phone);

  return {
    created_by: createdBy,
    business_name: business.name,
    normalized_name: normalizeBusinessName(business.name),
    category: category.label,
    category_slug: category.slug,
    address: business.address,
    normalized_address: normalizeAddress(business.address),
    city: business.city,
    county: business.county,
    state: business.state,
    zip: business.zip,
    latitude: business.latitude,
    longitude: business.longitude,
    phone: business.phone ?? "",
    normalized_phone: normalizedPhone,
    area_code: normalizedPhone?.slice(0, 3) ?? null,
    email: business.email,
    normalized_email: normalizeEmail(business.email),
    email_status: business.emailStatus,
    facebook_url: business.facebookUrl,
    normalized_facebook_url: normalizeFacebookUrl(business.facebookUrl),
    website_status: verification.status,
    potential_website_url: verification.potentialWebsiteUrl,
    qualified: verification.qualified,
    confidence_score: confidence.score,
    confidence_band: confidence.band,
    confidence_breakdown: confidence.breakdown,
    verification_notes: verification.notes.join(" "),
    sources: [
      business.listingUrl ? { source: "mock", url: business.listingUrl } : null,
      ...candidateUrls.map((c) => ({ source: c.source, url: c.url })),
    ].filter(Boolean),
    provider: "mock",
    provider_place_id: business.providerId,
    is_demo: true,
    last_checked_at: new Date().toISOString(),
  };
}

/**
 * Every demo lead as an insertable row, for the `loadDemoData` server function.
 *
 * Excludes the pool's `duplicate_pair` fixture (`mock-007`) — that business
 * exists to exercise the *search pipeline's* live dedupe path (two discoveries
 * in one run merging into one lead), which never runs here since demo rows
 * are inserted directly. Left in, it would collide with `mock-001` on the
 * `normalized_facebook_url` unique index and fail the whole batch insert.
 */
export function buildDemoLeadRows(createdBy: string): Record<string, unknown>[] {
  return DEMO_BUSINESSES.filter((business) => business.scenario !== "duplicate_pair").map(
    (business) => buildDemoLeadRow(business, createdBy),
  );
}
