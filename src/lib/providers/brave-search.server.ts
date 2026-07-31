/**
 * Brave Search API — a general web-search lookup used for three things
 * Google Places alone can't give google-places.provider.server.ts: whether a
 * no-website business has a Facebook page, a published email address for it,
 * and — via `discoverViaFacebookSearch` — finding candidate businesses in
 * the first place that Places' own search missed or ranked low, by searching
 * `site:facebook.com` instead of Places' structured directory.
 *
 * This is deliberately NOT a `SearchProvider`. Brave has no structured
 * business directory (no radius search, no place records), so it can never
 * serve `searchBusinesses` on its own — see brave.provider.stub.ts for that
 * (still unimplemented) full-provider shape. What Brave *can* do is search
 * the open web by name and location (or `site:facebook.com` plus a location)
 * and read whatever public results come back — directories, listings,
 * mentions, Facebook page titles — for a literal Facebook URL, email
 * address, or business name. Facebook itself is never fetched or scraped,
 * only whatever Brave already indexed about it (see COMPLIANCE.md).
 *
 * Same compliance rule as everywhere else in this folder: never construct or
 * guess an address. Every email this can return came from parsed page
 * content, not from a template. See COMPLIANCE.md and
 * email-discovery.test.ts.
 *
 * Auth: header "X-Subscription-Token: <BRAVE_SEARCH_API_KEY>" — a Cloudflare
 * Worker secret, read from `process.env`, never sent to the browser.
 */

import { fetchWithBackoff } from "@/lib/providers/http";
import { extractEmailFromHtml } from "@/lib/providers/page-probe.server";
import { isFacebookWebsiteUri } from "@/lib/providers/facebook-url";
import { normalizeFacebookUrl } from "@/lib/dedupe";
import { normalizeUrl } from "@/lib/url";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const FETCH_TIMEOUT_MS = 8_000;
/** How many of Brave's top results to actually fetch and scan for an email. */
const MAX_RESULTS_TO_PROBE = 3;
/**
 * Email search casts a wider net than the Facebook/discovery searches above:
 * more results per query, and multiple query phrasings, since a business's
 * email is often on a directory listing or contact page that a single
 * phrasing of the query doesn't surface.
 */
const MAX_EMAIL_RESULTS_TO_PROBE = 6;
/** Link text/href fragments that suggest a page with more contact detail than the homepage. */
const CONTACT_LINK_PATTERN = /contact|about|get-in-touch|reach-us/i;

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

export function isBraveSearchConfigured(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

/** Raw web search — exported separately so it's testable without the email-probing side effects. */
export async function braveWebSearch(
  query: string,
  count = MAX_RESULTS_TO_PROBE * 2,
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  // Brave's API caps a single request at 20 results.
  url.searchParams.set("count", String(Math.min(count, 20)));

  const response = await fetchWithBackoff(
    "brave",
    url.toString(),
    { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } },
    { maxRetries: 2 },
  );
  if (!response.ok) return [];

  const body = (await response.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (body.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    description: r.description ?? "",
  }));
}

/** Fetches a single URL and returns its HTML, or null on any failure/non-HTML response. */
async function fetchHtml(url: string): Promise<string | null> {
  if (!normalizeUrl(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchWithBackoff(
      "brave",
      url,
      {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "FacebookLeadFinderBot/1.0 (+https://businesswebexpress.com)" },
      },
      { maxRetries: 1 },
    );
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** The first same-origin contact/about-ish link found in a page's markup, resolved to an absolute URL. */
function findContactLink(html: string, pageUrl: string): string | null {
  const hrefs = [...html.matchAll(/<a\s+[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  for (const href of hrefs) {
    if (!CONTACT_LINK_PATTERN.test(href)) continue;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === new URL(pageUrl).origin) return resolved.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetches a result page and scans it for an email; if none is found, follows
 * one contact/about-ish link on that same page and scans that too. A
 * business's email is often on /contact rather than the page Brave indexed.
 */
async function fetchAndExtractEmail(url: string): Promise<string | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  const fromPage = extractEmailFromHtml(html);
  if (fromPage) return fromPage;

  const contactUrl = findContactLink(html, url);
  if (!contactUrl) return null;
  const contactHtml = await fetchHtml(contactUrl);
  return contactHtml ? extractEmailFromHtml(contactHtml) : null;
}

/**
 * Search the web for a business with no website and try to find a published
 * email address on whatever public pages come back — a directory listing, a
 * local news mention, an association page. Also checks each result's search
 * snippet itself (`description`), which often already contains the address
 * without needing to fetch the page at all.
 *
 * Returns `null` when Brave isn't configured, the search turns up nothing, or
 * no result page has a plausible address — never a guess.
 */
export async function findEmailViaWebSearch(business: {
  name: string;
  city: string;
  state: string;
}): Promise<string | null> {
  if (!isBraveSearchConfigured()) return null;

  const location = `${business.city}, ${business.state}`;
  const queries = [
    `"${business.name}" ${location} email`,
    `"${business.name}" ${location} contact`,
    `"${business.name}" ${location} "email address"`,
  ];

  const seen = new Set<string>();
  const results: BraveSearchResult[] = [];
  for (const query of queries) {
    for (const result of await braveWebSearch(query)) {
      if (!result.url || seen.has(result.url)) continue;
      seen.add(result.url);
      results.push(result);
    }
  }

  const toProbe = results.slice(0, MAX_EMAIL_RESULTS_TO_PROBE);

  for (const result of toProbe) {
    const fromSnippet = extractEmailFromHtml(result.description);
    if (fromSnippet) return fromSnippet;
  }

  for (const result of toProbe) {
    const fromPage = await fetchAndExtractEmail(result.url);
    if (fromPage) return fromPage;
  }

  return null;
}

/**
 * Search the web for a business with no independent website and check
 * whether a Facebook page turns up in the results — the URL Brave already
 * indexed, never fetched or scraped from Facebook itself (that boundary is
 * absolute — see COMPLIANCE.md). Rejects Facebook's own utility paths
 * (login, marketplace, search, ...) via the same `normalizeFacebookUrl`
 * dedupe.ts uses, so a stray facebook.com/login result can't be mistaken for
 * a business page.
 *
 * Returns `null` when Brave isn't configured or no result's URL is a
 * plausible Facebook business page — never a guess.
 */
export async function findFacebookPageViaWebSearch(business: {
  name: string;
  city: string;
  state: string;
}): Promise<string | null> {
  if (!isBraveSearchConfigured()) return null;

  const query = `"${business.name}" ${business.city}, ${business.state} facebook`;
  const results = await braveWebSearch(query);

  for (const result of results.slice(0, MAX_RESULTS_TO_PROBE)) {
    if (!isFacebookWebsiteUri(result.url)) continue;
    const normalized = normalizeFacebookUrl(result.url);
    if (normalized) return result.url;
  }

  return null;
}

export type FacebookSearchCandidate = { name: string };

/**
 * A Facebook page's Brave-indexed title is usually "Business Name | Facebook"
 * or "Business Name - Home | Facebook" — strip that suffix to get a plausible
 * business name. Returns `null` (never a guess) when nothing sensible is left.
 */
function extractBusinessName(title: string): string | null {
  const stripped = title
    .replace(/\s*[|–-]\s*(Home\s*)?[|–-]?\s*Facebook\s*$/i, "")
    .replace(/\s*\|\s*Facebook\s*$/i, "")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Discover candidate businesses via a `site:facebook.com` web search — Places'
 * own ranking/coverage sometimes just doesn't surface a business that would
 * otherwise qualify, and a business's Facebook page being indexed by Brave is
 * itself a signal worth following up on. Only Brave's own already-indexed
 * result titles/URLs are read here; Facebook itself is never fetched — see
 * COMPLIANCE.md.
 *
 * Returns bare candidate names, not full business records: names alone are
 * not evidence of anything (no address, no confirmed identity), which is why
 * the caller (google-places.provider.server.ts) looks each one up for real
 * via Places before treating it as an actual candidate — this function's job
 * is discovery, not verification.
 */
export async function discoverViaFacebookSearch(
  locationQuery: string,
): Promise<FacebookSearchCandidate[]> {
  if (!isBraveSearchConfigured()) return [];

  const results = await braveWebSearch(`site:facebook.com ${locationQuery}`, 20);

  const seen = new Set<string>();
  const candidates: FacebookSearchCandidate[] = [];
  for (const result of results) {
    if (!isFacebookWebsiteUri(result.url)) continue;
    if (!normalizeFacebookUrl(result.url)) continue; // rejects utility paths
    const name = extractBusinessName(result.title);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name });
  }
  return candidates;
}
