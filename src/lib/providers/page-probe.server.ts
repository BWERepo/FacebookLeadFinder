/**
 * Fetch a candidate URL and extract just enough to feed `scoreCandidate` in
 * verification.ts: whether it responded, its title, and a bounded amount of
 * visible text. Used by real (non-mock) providers' `verifyWebsite`.
 *
 * Server-only — this is a live outbound fetch to a third-party site, which
 * must never run in the browser (CORS aside, it would leak the visiting
 * user's IP to every candidate site instead of the Worker's).
 */

import { fetchWithBackoff } from "@/lib/providers/http";
import type { ProviderName, VerifyResult } from "@/lib/providers/types";
import { normalizeUrl } from "@/lib/url";

/** Page text is truncated to this length before it's stored or scored. */
export const MAX_PAGE_TEXT_CHARS = 20_000;

const FETCH_TIMEOUT_MS = 8_000;

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  const title = decodeHtmlEntities(match[1]).trim();
  return title === "" ? null : title;
}

/**
 * Crude HTML-to-text: strip tags and scripts/styles, collapse whitespace.
 *
 * Not a real HTML parser — this only needs to be good enough for
 * `scoreCandidate`'s phone/ZIP/city substring checks, not to render the page.
 */
function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const text = decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_PAGE_TEXT_CHARS);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Domains that turn up constantly in a raw regex scan of a page's HTML but
 * are never a business's own contact address — tracking pixels, a page
 * builder's own support address, placeholder addresses left in a template.
 * Filtering these out is about accuracy, not compliance: every address this
 * still returns came from the page's own literal text, nothing is guessed or
 * constructed (see providers/email-discovery.test.ts).
 */
const NON_BUSINESS_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "sentry.io",
  "wixpress.com",
  "godaddy.com",
  "schema.org",
  "w3.org",
  "domain.com",
  "yourdomain.com",
]);

const EMAIL_PATTERN =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

function isPlausibleBusinessEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || NON_BUSINESS_EMAIL_DOMAINS.has(domain)) return false;
  // A run of hex-ish characters before the @ is almost always a generated
  // asset hash or tracking ID (e.g. Wix/Squarespace embed noise), not
  // something a person typed as an address.
  if (/^[0-9a-f]{16,}$/i.test(email.split("@")[0])) return false;
  return true;
}

/**
 * Every plausible email address literally present in a page (or a plain text
 * snippet, e.g. a search result description): `mailto:` link targets first
 * (highest confidence — an explicit contact affordance), then any bare
 * address in the visible text. Returns `null` when nothing qualifies, never a
 * guessed or constructed address.
 */
export function extractEmailFromHtml(html: string): string | null {
  const mailtoMatches = [...html.matchAll(/mailto:([^"'\s?>]+)/gi)].map((m) =>
    decodeURIComponent(m[1]).toLowerCase(),
  );
  const fromMailto = mailtoMatches.find(isPlausibleBusinessEmail);
  if (fromMailto) return fromMailto;

  const text = extractVisibleText(html);
  const textMatches = text.match(EMAIL_PATTERN) ?? [];
  const fromText = textMatches.map((m) => m.toLowerCase()).find(isPlausibleBusinessEmail);
  return fromText ?? null;
}

export async function probePage(provider: ProviderName, url: string): Promise<VerifyResult> {
  // Defense in depth: searches.functions.ts already validates a candidate URL
  // with normalizeUrl before calling this, but this is the actual outbound
  // fetch boundary — an SSRF guard here holds even if a future caller forgets
  // to check first.
  if (!normalizeUrl(url)) return { reachable: false, pageTitle: null, pageText: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchWithBackoff(
      provider,
      url,
      {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          // Identifies the request honestly rather than spoofing a browser —
          // this is a compliance-sensitive tool and a candidate site's owner
          // is entitled to know what's crawling it.
          "User-Agent": "FacebookLeadFinderBot/1.0 (+https://businesswebexpress.com)",
        },
      },
      { maxRetries: 1 },
    );

    if (!response.ok) return { reachable: false, pageTitle: null, pageText: null };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { reachable: true, pageTitle: null, pageText: null };
    }

    const html = await response.text();
    return { reachable: true, pageTitle: extractTitle(html), pageText: extractVisibleText(html) };
  } catch {
    // Timeout, DNS failure, connection refused, TLS error — all read the same
    // to the verification logic: the site did not respond.
    return { reachable: false, pageTitle: null, pageText: null };
  } finally {
    clearTimeout(timeout);
  }
}
