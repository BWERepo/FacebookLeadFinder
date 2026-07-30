/**
 * SerpAPI — NOT IMPLEMENTED, but a real candidate for a second live provider
 * (paid, but a stable wrapper around Google's actual search results —
 * including Google Maps/Places results — via a documented, compliant API
 * rather than scraping).
 *
 * Intended shape when implemented:
 *   Endpoint: GET https://serpapi.com/search
 *   Auth:     query param `api_key=<SERPAPI_API_KEY>`
 *   Engine:   `engine=google_maps` for `searchBusinesses` (structured listings
 *             with name/address/phone/website, similar shape to Places);
 *             `engine=google` for `findPotentialWebsite`/`findPublicEmail`
 *             (ordinary web search results).
 *   The key is a Worker secret (`SERPAPI_API_KEY`), read via `process.env`
 *   inside the handler, never `VITE_`-prefixed. Every fetch should route
 *   through `fetchWithBackoff` in `./http.ts`.
 */

import { ProviderNotConfigured } from "./types";
import type { SearchProvider } from "./types";

export function createSerpApiProvider(): SearchProvider {
  const unavailable = (): never => {
    throw new ProviderNotConfigured("serpapi");
  };

  return {
    name: "serpapi",
    available: false,
    searchBusinesses: unavailable,
    findFacebookPage: unavailable,
    findPublicEmail: unavailable,
    findPotentialWebsite: unavailable,
    verifyWebsite: unavailable,
  };
}
