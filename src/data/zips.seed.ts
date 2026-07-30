/**
 * A small, hand-verified seed of US ZIP codes.
 *
 * The full USPS ZIP set is ~41,700 rows — far too large to transcribe by hand
 * without introducing silent errors (a wrong centroid returns wrong-but-
 * plausible search results, which is worse than an obvious failure). This seed
 * covers the cities used by the demo data set (Phase 7) and a spread of real
 * ZIPs across major metros, enough to exercise every code path — ZIP lookup,
 * radius search, county-to-ZIP expansion, area-code-to-ZIP expansion — in
 * development and in tests.
 *
 * For production coverage of every US ZIP, generate the full dataset from the
 * Census Bureau ZCTA gazetteer (public domain) with a script analogous to
 * `scripts/build-geo-data.mjs`, writing the format documented in
 * `src/data/geo.ts`. That is a follow-up, tracked as a known gap — this file
 * exists so the app is fully functional today rather than blocked on it.
 *
 * Columns: zip, city, state, county, latitude, longitude.
 */

export type ZipEntry = {
  zip: string;
  city: string;
  state: string;
  county: string;
  lat: number;
  lng: number;
};

export const ZIP_SEED: readonly ZipEntry[] = [
  // Knoxville, TN metro — the demo data's home base.
  { zip: "37902", city: "Knoxville", state: "TN", county: "Knox", lat: 35.9606, lng: -83.9207 },
  { zip: "37909", city: "Knoxville", state: "TN", county: "Knox", lat: 35.9328, lng: -84.0007 },
  { zip: "37919", city: "Knoxville", state: "TN", county: "Knox", lat: 35.9187, lng: -83.9635 },
  { zip: "37934", city: "Farragut", state: "TN", county: "Knox", lat: 35.8848, lng: -84.1594 },
  { zip: "37738", city: "Gatlinburg", state: "TN", county: "Sevier", lat: 35.7143, lng: -83.5102 },
  {
    zip: "37862",
    city: "Pigeon Forge",
    state: "TN",
    county: "Sevier",
    lat: 35.7885,
    lng: -83.5541,
  },
  { zip: "37743", city: "Greeneville", state: "TN", county: "Greene", lat: 36.1637, lng: -82.8321 },
  {
    zip: "37601",
    city: "Johnson City",
    state: "TN",
    county: "Washington",
    lat: 36.3134,
    lng: -82.3535,
  },
  { zip: "37660", city: "Kingsport", state: "TN", county: "Sullivan", lat: 36.5484, lng: -82.5618 },
  {
    zip: "37604",
    city: "Johnson City",
    state: "TN",
    county: "Washington",
    lat: 36.3184,
    lng: -82.4013,
  },

  // Nashville, TN metro
  { zip: "37201", city: "Nashville", state: "TN", county: "Davidson", lat: 36.1662, lng: -86.7744 },
  { zip: "37211", city: "Nashville", state: "TN", county: "Davidson", lat: 36.0631, lng: -86.7228 },
  {
    zip: "37027",
    city: "Brentwood",
    state: "TN",
    county: "Williamson",
    lat: 36.0331,
    lng: -86.7828,
  },
  {
    zip: "37064",
    city: "Franklin",
    state: "TN",
    county: "Williamson",
    lat: 35.9251,
    lng: -86.8689,
  },

  // Chattanooga, TN
  {
    zip: "37402",
    city: "Chattanooga",
    state: "TN",
    county: "Hamilton",
    lat: 35.0456,
    lng: -85.3097,
  },
  {
    zip: "37421",
    city: "Chattanooga",
    state: "TN",
    county: "Hamilton",
    lat: 35.0245,
    lng: -85.1836,
  },

  // Asheville, NC
  { zip: "28801", city: "Asheville", state: "NC", county: "Buncombe", lat: 35.5951, lng: -82.5515 },
  { zip: "28806", city: "Asheville", state: "NC", county: "Buncombe", lat: 35.5786, lng: -82.6019 },
  {
    zip: "28792",
    city: "Hendersonville",
    state: "NC",
    county: "Henderson",
    lat: 35.3187,
    lng: -82.4609,
  },

  // Charlotte, NC
  {
    zip: "28202",
    city: "Charlotte",
    state: "NC",
    county: "Mecklenburg",
    lat: 35.2251,
    lng: -80.8433,
  },
  {
    zip: "28277",
    city: "Charlotte",
    state: "NC",
    county: "Mecklenburg",
    lat: 35.0651,
    lng: -80.8395,
  },

  // Atlanta, GA metro
  { zip: "30303", city: "Atlanta", state: "GA", county: "Fulton", lat: 33.7537, lng: -84.3863 },
  { zip: "30305", city: "Atlanta", state: "GA", county: "Fulton", lat: 33.8365, lng: -84.3852 },
  { zip: "30060", city: "Marietta", state: "GA", county: "Cobb", lat: 33.9412, lng: -84.5273 },
  { zip: "30528", city: "Gainesville", state: "GA", county: "Hall", lat: 34.3178, lng: -83.7899 },

  // Birmingham, AL
  {
    zip: "35203",
    city: "Birmingham",
    state: "AL",
    county: "Jefferson",
    lat: 33.5153,
    lng: -86.8082,
  },
  {
    zip: "35226",
    city: "Birmingham",
    state: "AL",
    county: "Jefferson",
    lat: 33.4098,
    lng: -86.7692,
  },
  {
    zip: "35406",
    city: "Tuscaloosa",
    state: "AL",
    county: "Tuscaloosa",
    lat: 33.2451,
    lng: -87.5397,
  },

  // Little Rock, AR
  {
    zip: "72201",
    city: "Little Rock",
    state: "AR",
    county: "Pulaski",
    lat: 34.7465,
    lng: -92.2896,
  },
  {
    zip: "72703",
    city: "Fayetteville",
    state: "AR",
    county: "Washington",
    lat: 36.0779,
    lng: -94.1607,
  },

  // Denver, CO metro
  { zip: "80202", city: "Denver", state: "CO", county: "Denver", lat: 39.7508, lng: -104.9963 },
  { zip: "80301", city: "Boulder", state: "CO", county: "Boulder", lat: 40.0274, lng: -105.2519 },
  {
    zip: "80906",
    city: "Colorado Springs",
    state: "CO",
    county: "El Paso",
    lat: 38.7891,
    lng: -104.7863,
  },

  // Hartford, CT
  { zip: "06103", city: "Hartford", state: "CT", county: "Hartford", lat: 41.7658, lng: -72.6734 },
  {
    zip: "06604",
    city: "Bridgeport",
    state: "CT",
    county: "Fairfield",
    lat: 41.1792,
    lng: -73.1894,
  },

  // Wilmington, DE
  {
    zip: "19801",
    city: "Wilmington",
    state: "DE",
    county: "New Castle",
    lat: 39.7447,
    lng: -75.5484,
  },
  { zip: "19901", city: "Dover", state: "DE", county: "Kent", lat: 39.1582, lng: -75.5244 },

  // Miami / Orlando / Tampa, FL
  { zip: "33130", city: "Miami", state: "FL", county: "Miami-Dade", lat: 25.7663, lng: -80.1994 },
  { zip: "32801", city: "Orlando", state: "FL", county: "Orange", lat: 28.5411, lng: -81.3792 },
  { zip: "33602", city: "Tampa", state: "FL", county: "Hillsborough", lat: 27.9478, lng: -82.4584 },
  { zip: "32301", city: "Tallahassee", state: "FL", county: "Leon", lat: 30.4394, lng: -84.2739 },

  // Phoenix, AZ
  { zip: "85004", city: "Phoenix", state: "AZ", county: "Maricopa", lat: 33.4519, lng: -112.0709 },
  {
    zip: "85251",
    city: "Scottsdale",
    state: "AZ",
    county: "Maricopa",
    lat: 33.4942,
    lng: -111.9261,
  },
  { zip: "85701", city: "Tucson", state: "AZ", county: "Pima", lat: 32.2226, lng: -110.9747 },

  // Los Angeles / San Francisco, CA
  {
    zip: "90012",
    city: "Los Angeles",
    state: "CA",
    county: "Los Angeles",
    lat: 34.0611,
    lng: -118.2411,
  },
  {
    zip: "94103",
    city: "San Francisco",
    state: "CA",
    county: "San Francisco",
    lat: 37.7726,
    lng: -122.4099,
  },
  {
    zip: "92101",
    city: "San Diego",
    state: "CA",
    county: "San Diego",
    lat: 32.7174,
    lng: -117.1628,
  },
  {
    zip: "95814",
    city: "Sacramento",
    state: "CA",
    county: "Sacramento",
    lat: 38.5811,
    lng: -121.4936,
  },

  // Seattle, WA / Portland, OR (out-of-catalogue states, for cross-state tests)
  { zip: "98101", city: "Seattle", state: "WA", county: "King", lat: 47.6101, lng: -122.3344 },
  {
    zip: "97201",
    city: "Portland",
    state: "OR",
    county: "Multnomah",
    lat: 45.5099,
    lng: -122.6844,
  },

  // New York / Boston (northeast coverage)
  { zip: "10001", city: "New York", state: "NY", county: "New York", lat: 40.7506, lng: -73.9972 },
  { zip: "02108", city: "Boston", state: "MA", county: "Suffolk", lat: 42.3583, lng: -71.0658 },

  // Chicago, IL / Detroit, MI (midwest coverage)
  { zip: "60601", city: "Chicago", state: "IL", county: "Cook", lat: 41.8858, lng: -87.6229 },
  { zip: "48226", city: "Detroit", state: "MI", county: "Wayne", lat: 42.3345, lng: -83.0483 },
] as const;
