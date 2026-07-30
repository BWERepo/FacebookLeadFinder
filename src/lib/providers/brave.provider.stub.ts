/**
 * Brave Search API — NOT IMPLEMENTED, but a real candidate for a second live
 * provider (has a free tier, is a currently-maintained product).
 *
 * Intended shape when implemented:
 *   Endpoint: GET https://api.search.brave.com/res/v1/web/search
 *   Auth:     header "X-Subscription-Token: <BRAVE_SEARCH_API_KEY>"
 *   Query:    `q=<business name/category> <city>, <state> <zip>`
 *   The key is a Worker secret (`BRAVE_SEARCH_API_KEY`), read via
 *   `process.env` inside the handler, never `VITE_`-prefixed.
 *
 * Brave has no dedicated places/business index — it would serve
 * `findPotentialWebsite` and `findPublicEmail` (searching web results for a
 * business's own site or a listed email) rather than `searchBusinesses`,
 * which needs a structured business directory such as Google Places.
 * Every fetch should route through `fetchWithBackoff` in `./http.ts`.
 */

import { ProviderNotConfigured } from "./types";
import type { SearchProvider } from "./types";

export function createBraveProvider(): SearchProvider {
  const unavailable = (): never => {
    throw new ProviderNotConfigured("brave");
  };

  return {
    name: "brave",
    available: false,
    searchBusinesses: unavailable,
    findFacebookPage: unavailable,
    findPublicEmail: unavailable,
    findPotentialWebsite: unavailable,
    verifyWebsite: unavailable,
  };
}
