/**
 * Google Places API (New) v1 adapter — PLACEHOLDER.
 *
 * The real implementation lands in Phase 11 (Settings + Google Places
 * adapter). This file exists now so `registry.ts` has a stable shape to import
 * across phases — Phase 11 replaces the body of `createGooglePlacesProvider`
 * without any caller needing to change.
 *
 * Planned shape, for reference:
 *   POST https://places.googleapis.com/v1/places:searchText and :searchNearby
 *   Auth: header "X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>" (Worker secret)
 *   Mandatory header: X-Goog-FieldMask (a missing mask is a 400)
 *   The `websiteUri` field drives qualification — see COMPLIANCE.md for the
 *   documented limitation: Places alone can only confirm a Facebook page when
 *   a listing's own website field points at facebook.com.
 */

import { ProviderNotConfigured } from "./types";
import type { SearchProvider } from "./types";

export function createGooglePlacesProvider(): SearchProvider {
  const unavailable = (): never => {
    throw new ProviderNotConfigured("google_places");
  };

  return {
    name: "google_places",
    // Always false until Phase 11 fills in the implementation, regardless of
    // whether GOOGLE_PLACES_API_KEY is set — the registry must never return a
    // provider that can't actually do anything.
    available: false,
    searchBusinesses: unavailable,
    findFacebookPage: unavailable,
    findPublicEmail: unavailable,
    findPotentialWebsite: unavailable,
    verifyWebsite: unavailable,
  };
}
