/**
 * A pre-queue data-quality filter — separate from `verification.ts`'s website
 * classification, which only runs on candidates that already made it into
 * `search_results`. This runs earlier, at discovery time, to keep obviously
 * non-business results from ever being queued at all.
 *
 * Google Places' text search for an area (e.g. "businesses in Knox County,
 * TN") sometimes returns the area itself, or a township within it, as a
 * pseudo-business: name "Knox County", phone null, address "Knox County, TN,
 * USA" — the county's own formatted address, not a street address. Those
 * candidates can never become a real lead (no owner to contact), so this
 * filters them out before they consume a verify-phase provider call.
 */

/** A real US street address starts with a house number; an area's own formatted address never does. */
function looksLikeStreetAddress(address: string): boolean {
  return /^\s*\d+\s/.test(address);
}

export function hasContactableIdentity(business: { phone: string | null; address: string }): boolean {
  return Boolean(business.phone) || looksLikeStreetAddress(business.address);
}
