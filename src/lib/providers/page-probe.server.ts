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

export async function probePage(provider: ProviderName, url: string): Promise<VerifyResult> {
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
