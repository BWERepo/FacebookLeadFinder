/**
 * Shared by google-places.provider.server.ts and brave-search.server.ts —
 * split out to a tiny standalone module (rather than exported from either
 * provider file) so neither has to import from the other. google-places
 * calls into brave-search (its email/Facebook-page fallback), so
 * brave-search importing back from google-places would be a cycle.
 */
export function isFacebookWebsiteUri(uri: string | null): boolean {
  if (!uri) return false;
  try {
    const host = new URL(uri).hostname.replace(/^www\./, "");
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}
