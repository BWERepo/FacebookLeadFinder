/**
 * Bing Web Search API — NOT IMPLEMENTED.
 *
 * Microsoft retired the Bing Web Search API in August 2025. This stub exists
 * so the `SearchProvider` interface has a complete, documented placeholder for
 * every provider named in the original spec, and so `registry.ts` can list it
 * as an option with an honest "not available" reason rather than omitting it
 * silently. There is no live service left to implement this against.
 *
 * If Microsoft (or a successor product) ships a replacement, implement it
 * here following the same shape as `google-places.provider.ts`: read the key
 * from a Worker secret via `process.env`, never `VITE_`-prefixed, and route
 * every fetch through `fetchWithBackoff` in `./http.ts`.
 */

import { ProviderNotConfigured } from "./types";
import type { SearchProvider } from "./types";

export function createBingProvider(): SearchProvider {
  const unavailable = (): never => {
    throw new ProviderNotConfigured("bing");
  };

  return {
    name: "bing",
    available: false,
    searchBusinesses: unavailable,
    findFacebookPage: unavailable,
    findPublicEmail: unavailable,
    findPotentialWebsite: unavailable,
    verifyWebsite: unavailable,
  };
}
