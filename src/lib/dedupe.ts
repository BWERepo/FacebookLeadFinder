/**
 * Duplicate detection. Pure — no network, no database.
 *
 * The same business arrives more than once for boring reasons: a second search
 * covers an overlapping ZIP, a CSV import repeats what a search already found,
 * a directory writes the phone number differently. The rule from the spec is
 * that a possible duplicate must never silently create a second record — so
 * everything here is about deciding, from two records, whether they are the
 * same business, and how sure we are.
 *
 * Certainty matters as much as the match itself. A "certain" match merges
 * automatically; anything less is surfaced for a human, because a wrong merge
 * destroys data and a wrong split is merely untidy.
 */

import { emailDomain, isFreeEmailDomain } from "@/lib/url";

/**
 * Unicode combining diacritical marks (U+0300–U+036F).
 *
 * After `normalize("NFKD")` splits "Café" into "Cafe" + a combining acute
 * accent, removing this range leaves plain ASCII. Written with escapes because
 * the literal characters are invisible in an editor.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/**
 * Suffixes that say something about a company's legal form, not its identity.
 *
 * "Smith Plumbing" and "Smith Plumbing LLC" are the same business, and
 * directories disagree constantly about which to print.
 */
const LEGAL_SUFFIXES = [
  "llc",
  "l l c",
  "inc",
  "incorporated",
  "co",
  "corp",
  "corporation",
  "ltd",
  "limited",
  "llp",
  "lp",
  "pllc",
  "pc",
  "plc",
  "dba",
  "and sons",
  "and son",
  "and daughters",
];

/**
 * Canonical form of a business name for comparison.
 *
 *   "The Smith & Sons Plumbing Co., LLC" -> "smith and sons plumbing"
 *
 * Never displayed — `business_name` keeps whatever the source published.
 */
export function normalizeBusinessName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";

  let value = raw
    // Strip accents so "Café" and "Cafe" compare equal.
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();

  // "&" and "and" are interchangeable in business names and directories pick
  // arbitrarily. Normalize before punctuation is stripped.
  value = value.replace(/&/g, " and ");
  // Drop apostrophes without leaving a gap: "Joe's" -> "joes", not "joe s".
  value = value.replace(/['’ʼ]/g, "");
  value = value.replace(/[^a-z0-9]+/g, " ").trim();
  value = value.replace(/^the\s+/, "");

  // Loop, because names stack them: "Smith Plumbing Co LLC".
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }

  return value.replace(/\s+/g, " ").trim();
}

/**
 * A US phone number reduced to its 10 significant digits, or `null`.
 *
 *   "+1 (865) 555-0142 ext. 12" -> "8655550142"
 *
 * Returning `null` rather than a partial string matters: two records that both
 * failed to yield a phone number must not be considered a phone match.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  // A trailing extension is not part of the number. Matched as a whole
  // trailing group rather than split on the keyword, because "x12" has no word
  // boundary after the "x" and a naive \bx\b never fires.
  const withoutExtension = raw.replace(/\s*\b(?:extension|ext|x)\.?\s*\d+\s*$/i, "");
  const digits = withoutExtension.replace(/\D/g, "");

  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // A US area code and exchange never start with 0 or 1.
  if (national[0] === "0" || national[0] === "1") return null;

  return national;
}

/** The area code from a phone number, or `null` if it isn't usable. */
export function areaCodeOf(raw: string | null | undefined): string | null {
  return normalizePhone(raw)?.slice(0, 3) ?? null;
}

/** Subdomains Facebook serves the same page under. */
const FACEBOOK_HOST_PREFIXES =
  /^(www|m|web|business|touch|mbasic|free|d|[a-z]{2}-[a-z]{2}|[a-z]{2})\./;

/** Tabs of a page, which are the same page for our purposes. */
const FACEBOOK_PAGE_TABS =
  /\/(about|posts|photos|videos|reviews|shop|services|events|community|menu|offers|jobs|live|groups|info)(\/.*)?$/i;

/**
 * Canonical form of a Facebook page URL, or `null` if it isn't one.
 *
 *   https://m.facebook.com/JoesPlumbing/about?ref=page  -> facebook.com/JoesPlumbing
 *   https://fb.com/pages/Joes-Plumbing/123456789        -> facebook.com/123456789
 *   https://facebook.com/profile.php?id=123456789       -> facebook.com/profile.php?id=123456789
 *
 * This is the strongest duplicate signal there is, which is why it gets the
 * most careful normalization — and why the leads table has a unique index on
 * the result.
 *
 * Case is preserved in the path: Facebook vanity URLs are case-insensitive to
 * *visit*, but lowercasing would make the stored value differ from the real
 * page name. Comparison callers should use this function on both sides.
 */
export function normalizeFacebookUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  let host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  // Only strip a subdomain prefix when one actually exists. Without the label
  // count, the two-letter locale alternative eats the "fb." of "fb.com" and
  // leaves the bare TLD.
  if (host.split(".").length > 2) host = host.replace(FACEBOOK_HOST_PREFIXES, "");
  if (host === "fb.com" || host === "fb.me" || host === "facebook.net") host = "facebook.com";
  if (host !== "facebook.com") return null;

  let path = parsed.pathname.replace(/\/+$/, "");

  // profile.php?id=N is the canonical form for pages with no vanity URL — the
  // one case where the query string is the identity.
  if (/\/profile\.php$/i.test(path)) {
    const id = parsed.searchParams.get("id");
    return id && /^\d+$/.test(id) ? `facebook.com/profile.php?id=${id}` : null;
  }

  path = path.replace(/^\/pg\//, "/");
  // /pages/Some-Business-Name/123456789 -> /123456789 (the id is the identity)
  path = path.replace(/^\/pages\/[^/]+\/(\d+).*$/, "/$1");
  path = path.replace(/^\/pages\/category\/[^/]+\//, "/");
  path = path.replace(FACEBOOK_PAGE_TABS, "");
  path = path.replace(/\/+$/, "");

  if (path === "" || path === "/") return null;
  // Reject Facebook's own utility paths — they identify no business.
  if (/^\/(login|home\.php|sharer|search|marketplace|watch|gaming|events)\b/i.test(path)) {
    return null;
  }

  return `facebook.com${path}`;
}

/** Lowercased, trimmed email. No provider-specific tricks. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  // Deliberately no gmail dot-stripping or plus-tag removal: for a *business*
  // contact address those are meaningful, and treating info@ and info+leads@
  // as one address would merge two records that a human listed separately.
  return value === "" || !value.includes("@") ? null : value;
}

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: "st",
  road: "rd",
  avenue: "ave",
  boulevard: "blvd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  circle: "cir",
  place: "pl",
  parkway: "pkwy",
  highway: "hwy",
  suite: "ste",
  apartment: "apt",
  building: "bldg",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

/**
 * Canonical street address.
 *
 *   "123 North Main Street, Suite 4" -> "123 n main st ste 4"
 */
export function normalizeAddress(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";

  const words = raw
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => STREET_ABBREVIATIONS[word] ?? word);

  return words.join(" ");
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * Sørensen–Dice coefficient over character bigrams: 0 (nothing in common) to
 * 1 (identical).
 *
 * Chosen over Levenshtein because it cares about shared substrings rather than
 * edit distance, which suits business names — "Joe's Plumbing" vs "Joes
 * Plumbing and Heating" share a lot of the important part. ~25 lines, so no
 * dependency.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.slice(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.slice(i, i + 2);
    const count = bigrams.get(bigram) ?? 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

/** Dice similarity of two business names after normalization. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  return diceCoefficient(normalizeBusinessName(a), normalizeBusinessName(b));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** The comparable fields of a lead. Both sides of a match use this shape. */
export type DedupeCandidate = {
  id?: string;
  normalized_name?: string | null;
  normalized_phone?: string | null;
  normalized_email?: string | null;
  normalized_facebook_url?: string | null;
  normalized_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  provider?: string | null;
  provider_place_id?: string | null;
};

export type DuplicateRule =
  | "exact_facebook_url"
  | "exact_place_id"
  | "phone_and_name"
  | "name_and_address"
  | "phone_only"
  | "name_and_zip"
  | "email"
  | "fuzzy_name_and_city";

export type DuplicateCertainty = "certain" | "probable" | "possible";

export type DuplicateMatch<T extends DedupeCandidate> = {
  lead: T;
  rule: DuplicateRule;
  certainty: DuplicateCertainty;
  /** Human-readable reason, shown in the merge dialog. */
  reason: string;
};

/** Which optional rules are switched on. Certain-match rules are not optional. */
export type DuplicateRuleSettings = {
  phone_only: boolean;
  name_and_zip: boolean;
  email: boolean;
  fuzzy_name_and_city: boolean;
};

export const DEFAULT_DUPLICATE_RULES: DuplicateRuleSettings = {
  phone_only: true,
  name_and_zip: true,
  email: true,
  fuzzy_name_and_city: true,
};

/** Name similarity required to call a phone-plus-name match certain. */
const PHONE_NAME_SIMILARITY = 0.8;
/** Name similarity required for the weakest rule, name-plus-city. */
const FUZZY_NAME_SIMILARITY = 0.92;

function bothPresent(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b);
}

function sameNonEmpty(a: string | null | undefined, b: string | null | undefined): boolean {
  return bothPresent(a, b) && a === b;
}

/**
 * Find the best existing record that looks like the same business.
 *
 * Rules are evaluated in precedence order and the first hit wins, so a
 * `certain` match is never downgraded by a weaker rule matching too.
 *
 * `existing` should already be narrowed by an indexed query — the caller looks
 * up rows matching any of the normalized keys rather than scanning the table.
 */
export function findDuplicate<T extends DedupeCandidate>(
  candidate: DedupeCandidate,
  existing: readonly T[],
  settings: DuplicateRuleSettings = DEFAULT_DUPLICATE_RULES,
): DuplicateMatch<T> | null {
  // --- certain -------------------------------------------------------------

  for (const lead of existing) {
    if (sameNonEmpty(candidate.normalized_facebook_url, lead.normalized_facebook_url)) {
      return {
        lead,
        rule: "exact_facebook_url",
        certainty: "certain",
        reason: "Same Facebook page",
      };
    }
  }

  for (const lead of existing) {
    if (
      sameNonEmpty(candidate.provider_place_id, lead.provider_place_id) &&
      sameNonEmpty(candidate.provider, lead.provider)
    ) {
      return {
        lead,
        rule: "exact_place_id",
        certainty: "certain",
        reason: "Same listing from the same provider",
      };
    }
  }

  for (const lead of existing) {
    if (
      sameNonEmpty(candidate.normalized_phone, lead.normalized_phone) &&
      nameSimilarity(candidate.normalized_name, lead.normalized_name) >= PHONE_NAME_SIMILARITY
    ) {
      return {
        lead,
        rule: "phone_and_name",
        certainty: "certain",
        reason: "Same phone number and a matching name",
      };
    }
  }

  for (const lead of existing) {
    if (
      sameNonEmpty(candidate.normalized_name, lead.normalized_name) &&
      sameNonEmpty(candidate.normalized_address, lead.normalized_address)
    ) {
      return {
        lead,
        rule: "name_and_address",
        certainty: "certain",
        reason: "Same name at the same address",
      };
    }
  }

  // --- probable ------------------------------------------------------------

  if (settings.phone_only) {
    for (const lead of existing) {
      if (sameNonEmpty(candidate.normalized_phone, lead.normalized_phone)) {
        return {
          lead,
          rule: "phone_only",
          certainty: "probable",
          reason: "Same phone number, but the names differ",
        };
      }
    }
  }

  if (settings.name_and_zip) {
    for (const lead of existing) {
      if (
        sameNonEmpty(candidate.normalized_name, lead.normalized_name) &&
        sameNonEmpty(candidate.zip, lead.zip)
      ) {
        return {
          lead,
          rule: "name_and_zip",
          certainty: "probable",
          reason: "Same name in the same ZIP code",
        };
      }
    }
  }

  if (settings.email) {
    for (const lead of existing) {
      if (!sameNonEmpty(candidate.normalized_email, lead.normalized_email)) continue;
      // Two unrelated businesses can share a gmail address (a spouse, an
      // accountant, a franchisee), so a free-provider address is not evidence.
      if (isFreeEmailDomain(emailDomain(candidate.normalized_email))) continue;
      return {
        lead,
        rule: "email",
        certainty: "probable",
        reason: "Same business email address",
      };
    }
  }

  // --- possible ------------------------------------------------------------

  if (settings.fuzzy_name_and_city) {
    for (const lead of existing) {
      if (
        sameNonEmpty(candidate.city, lead.city) &&
        sameNonEmpty(candidate.state, lead.state) &&
        nameSimilarity(candidate.normalized_name, lead.normalized_name) >= FUZZY_NAME_SIMILARITY
      ) {
        return {
          lead,
          rule: "fuzzy_name_and_city",
          certainty: "possible",
          reason: "Very similar name in the same city",
        };
      }
    }
  }

  return null;
}

/**
 * Merge new information into an existing lead without ever losing what's there.
 *
 * Only fills fields that are currently blank. A later source that knows less
 * than an earlier one must not erase the difference — which is why this returns
 * a patch of just the additions rather than a whole record.
 */
export function mergePatch<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
): Partial<T> {
  const patch: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming) as [keyof T, T[keyof T]][]) {
    if (value === null || value === undefined || value === "") continue;
    const current = existing[key];
    const currentIsBlank = current === null || current === undefined || current === "";
    if (currentIsBlank) patch[key] = value;
  }
  return patch;
}
