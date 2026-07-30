/**
 * URL parsing and normalization. Pure — no network, no DOM.
 *
 * Everything downstream (excluded-domain matching, candidate scoring, duplicate
 * detection, export hyperlinks) compares URLs, and URLs are full of ways for
 * two strings to mean the same thing. Normalizing once, here, is what keeps
 * those comparisons honest.
 */

/** A parsed, normalized URL. `url` is the canonical string form. */
export type NormalizedUrl = {
  /** Canonical form: scheme + host + path, no www, no fragment, no tracking params. */
  url: string;
  /** Lowercased host with any leading `www.` removed. */
  host: string;
  /** The registrable domain (roughly "the bit you buy"). */
  registrableDomain: string;
  /** Path with any trailing slash removed. `""` for a bare host. */
  path: string;
  /** Remaining query string after tracking params are dropped, without `?`. */
  query: string;
  scheme: "http" | "https";
};

/**
 * Query parameters that identify a marketing campaign rather than a page.
 * Dropping them stops the same page arriving twice under different names.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^ref$/i,
  /^referrer$/i,
  /^source$/i,
  /^_ga$/i,
  /^yclid$/i,
  /^si$/i,
];

/**
 * Multi-part public suffixes we handle.
 *
 * A full Public Suffix List would be a ~250 KB dependency that has to be kept
 * current. This is a US local-business tool: the domains it sees are
 * overwhelmingly .com/.net/.org/.us, and the cost of getting an unusual foreign
 * suffix slightly wrong is one extra "needs manual review", not a wrong claim.
 * The limitation is deliberate and is covered by a test.
 */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "co.za",
  "co.jp",
  "co.in",
  "com.sg",
  "co.il",
]);

/** Hosts that are never a real destination. */
const INVALID_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** A syntactically plausible domain name: labels separated by dots. */
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * True if the string contains any C0 control character, space, or DEL.
 *
 * Browsers strip \t, \n and \r from a URL *before* parsing it, so
 * "jav\tascript:alert(1)" is a javascript: URL to them while looking harmless
 * to a naive scheme check. Rejecting the whole class is safer than trying to
 * predict which characters a given browser strips. Written as a codepoint scan
 * rather than a regex so the range is unambiguous in source.
 */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Parse and canonicalize a URL string.
 *
 * Accepts input with no scheme ("example.com/about") because that is how URLs
 * arrive from spreadsheets and directory listings. Returns `null` for anything
 * that isn't a usable http(s) web address.
 */
export function normalizeUrl(raw: string | null | undefined): NormalizedUrl | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || hasControlCharacters(trimmed)) return null;

  // A bare "example.com" has no scheme. Only assume https:// when the string
  // doesn't already carry *some* scheme — otherwise "javascript:alert(1)"
  // would become "https://javascript:alert(1)" and sneak through.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // Credentials in a URL are a phishing signal and never appear on a real
  // business website.
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (host === "" || INVALID_HOSTS.has(host)) return null;
  // Must look like a real domain. Rejects "https://foo" and IP literals.
  if (!HOST_PATTERN.test(host)) return null;

  const scheme = parsed.protocol === "http:" ? "http" : "https";

  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) params.delete(key);
  }
  // Sort so ?b=2&a=1 and ?a=1&b=2 canonicalize the same way.
  params.sort();
  const query = params.toString();

  const path = parsed.pathname.replace(/\/+$/, "");

  const url = `${scheme}://${host}${path}${query ? `?${query}` : ""}`;

  return { url, host, registrableDomain: registrableDomain(host), path, query, scheme };
}

/**
 * The registrable domain for a host: "shop.example.co.uk" -> "example.co.uk".
 *
 * Used so that `m.facebook.com`, `www.facebook.com` and `en-gb.facebook.com`
 * all collapse to the same thing when matched against an exclusion list.
 */
export function registrableDomain(host: string): string {
  const labels = host
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");

  return lastTwo;
}

/**
 * Is this URL safe to put behind a link or an XLSX hyperlink cell?
 *
 * Deliberately stricter than `normalizeUrl`: this is the last gate before a URL
 * from a third-party data source becomes something a user can click, so it
 * requires an explicit http(s) scheme rather than assuming one.
 */
export function isSafeExternalUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (value === "" || hasControlCharacters(value)) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return parsed.hostname !== "";
}

/** The domain part of an email address, lowercased. `null` if unparseable. */
export function emailDomain(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.includes(".") ? domain : null;
}

/**
 * Mailbox providers where the domain says nothing about the business.
 *
 * A business emailing from `@gmail.com` has no domain of its own, which is
 * evidence *for* the thesis that it has no website. A business emailing from
 * `@joesplumbing.com` almost certainly does have one.
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "mail.com",
  "zoho.com",
  "comcast.net",
  "att.net",
  "verizon.net",
  "bellsouth.net",
  "charter.net",
  "cox.net",
  "sbcglobal.net",
  "earthlink.net",
  "juno.com",
  "aim.com",
  "outlook.co.uk",
  "hotmail.co.uk",
]);

export function isFreeEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Strict-enough email validation for imported data.
 *
 * Not RFC 5322 — that grammar accepts addresses no business has ever used and
 * takes a page of regex. This accepts the shape real contact addresses take and
 * rejects the malformed values spreadsheets are full of.
 */
export function isValidEmail(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  if (value.length === 0 || value.length > 254) return false;
  if (hasControlCharacters(value)) return false;
  return /^[^@\s.][^@\s]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
    value,
  );
}
