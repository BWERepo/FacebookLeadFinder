/**
 * Confidence scoring. Pure — no network, no database.
 *
 * The score answers one question: **how likely is it that this business has no
 * independent website?** 0 means "almost certainly has one", 100 means "as sure
 * as this tool gets".
 *
 * Two design choices worth stating, because both are about not overclaiming:
 *
 *   1. Unknown is not the same as false. A signal we never got to check scores
 *      zero *and* is counted, so a lead assembled from thin evidence can't
 *      accumulate a high score by default.
 *
 *   2. Signals never outrank a contrary finding. If verification actually found
 *      a website, no amount of supporting signal can push the score above the
 *      `website_found` cap. The caps at the bottom of `scoreConfidence` are
 *      what enforce "do not present uncertain leads as confirmed".
 *
 * Every score is stored with its breakdown so the UI can always explain it.
 */

import { confidenceBandFor, type ConfidenceBand, type WebsiteStatus } from "@/lib/domain";

/**
 * `null` means "not established", which is different from `false`.
 *
 * Example: `no_site_in_phone_search` is `false` when a phone search returned a
 * website, and `null` when no phone search ran at all.
 */
export type SignalValue = true | false | null;

export const CONFIDENCE_RUBRIC = [
  {
    key: "facebook_page_confirmed",
    label: "Facebook business page confirmed from a compliant source",
    max: 20,
  },
  {
    key: "fb_profile_lists_no_website",
    label: "Facebook profile lists no website",
    max: 15,
  },
  {
    key: "no_site_in_name_search",
    label: "No independent website in a business-name search",
    max: 15,
  },
  {
    key: "provider_no_website_uri",
    label: "Provider listing has no website, or points at Facebook",
    max: 12,
  },
  {
    key: "no_own_domain_email",
    label: "No email on the business's own domain",
    max: 10,
  },
  {
    key: "directories_show_no_website",
    label: "Directory listings show no website",
    max: 8,
  },
  {
    key: "no_site_in_phone_search",
    label: "Phone-number search returns no independent site",
    max: 8,
  },
  {
    key: "no_site_in_address_search",
    label: "Address search returns no independent site",
    max: 5,
  },
  {
    key: "name_is_distinctive",
    label: "Business name distinctive enough for a negative search to mean something",
    max: 4,
  },
  {
    key: "only_social_or_directory",
    label: "Every discovered URL is social, directory or marketplace",
    max: 3,
  },
] as const;

export type SignalKey = (typeof CONFIDENCE_RUBRIC)[number]["key"];

export type ConfidenceSignals = Record<SignalKey, SignalValue>;

export type ConfidenceLine = {
  key: SignalKey;
  label: string;
  points: number;
  max: number;
  value: SignalValue;
};

export type ConfidenceResult = {
  score: number;
  band: ConfidenceBand;
  breakdown: ConfidenceLine[];
  /** How many signals were never established. High counts trigger a cap. */
  unknowns: number;
  /** Which cap, if any, limited the score. Surfaced in the UI. */
  cappedBy: string | null;
};

/** Every signal unknown. The honest starting point. */
export function emptySignals(): ConfidenceSignals {
  return Object.fromEntries(CONFIDENCE_RUBRIC.map((r) => [r.key, null])) as ConfidenceSignals;
}

/**
 * Score caps by website status.
 *
 * These are the teeth behind the spec's "do not present uncertain leads as
 * confirmed website-free businesses". A lead whose verification is ambiguous
 * cannot reach the 60 threshold that would let it be shown as qualified, no
 * matter how many supporting signals fired.
 */
const STATUS_CAPS: Partial<Record<WebsiteStatus, { max: number; reason: string }>> = {
  website_found: { max: 10, reason: "An independent website was found" },
  needs_manual_review: { max: 55, reason: "Verification was inconclusive" },
  unable_to_verify: { max: 45, reason: "Verification could not be completed" },
};

/** Above this many unknown signals, the evidence is too thin to be confident. */
const MAX_UNKNOWNS_BEFORE_CAP = 4;
const THIN_EVIDENCE_CAP = 45;

export function scoreConfidence(
  signals: ConfidenceSignals,
  status: WebsiteStatus,
): ConfidenceResult {
  let raw = 0;
  const breakdown: ConfidenceLine[] = CONFIDENCE_RUBRIC.map((rule) => {
    const value = signals[rule.key] ?? null;
    // Only an explicit `true` earns points. `false` and `null` both score zero,
    // but they are shown differently in the breakdown.
    const points = value === true ? rule.max : 0;
    raw += points;
    return { key: rule.key, label: rule.label, points, max: rule.max, value };
  });

  const unknowns = CONFIDENCE_RUBRIC.filter((rule) => (signals[rule.key] ?? null) === null).length;

  let score = raw;
  let cappedBy: string | null = null;

  const statusCap = STATUS_CAPS[status];
  if (statusCap && score > statusCap.max) {
    score = statusCap.max;
    cappedBy = statusCap.reason;
  }

  if (unknowns > MAX_UNKNOWNS_BEFORE_CAP && score > THIN_EVIDENCE_CAP) {
    score = THIN_EVIDENCE_CAP;
    cappedBy = `Only ${CONFIDENCE_RUBRIC.length - unknowns} of ${CONFIDENCE_RUBRIC.length} checks completed`;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, band: confidenceBandFor(score), breakdown, unknowns, cappedBy };
}

/**
 * Generic words that appear in thousands of business names.
 *
 * Used by `isDistinctiveName`: a negative search for "Home Services" proves
 * nothing, because the search engine can't tell which "Home Services" you
 * meant. A negative search for "Bergstrom Hydronics" is meaningful.
 */
const GENERIC_NAME_WORDS = new Set([
  "auto",
  "repair",
  "shop",
  "salon",
  "cleaning",
  "services",
  "service",
  "plumbing",
  "hvac",
  "heating",
  "cooling",
  "air",
  "electric",
  "electrical",
  "roofing",
  "landscaping",
  "lawn",
  "care",
  "dental",
  "bakery",
  "cafe",
  "restaurant",
  "the",
  "and",
  "of",
  "for",
  "co",
  "company",
  "best",
  "quality",
  "pro",
  "professional",
  "home",
  "local",
  "family",
  "affordable",
  "express",
  "premier",
  "advanced",
  "american",
  "general",
  "custom",
  "complete",
  "total",
  "first",
  "new",
  "city",
  "town",
  "county",
  "center",
  "centre",
  "group",
  "solutions",
  "systems",
  "supply",
  "works",
  "shoppe",
  "store",
  "llc",
  "inc",
]);

/**
 * Is this name specific enough that "no website found" means something?
 *
 * Requires at least two words and at least one word that isn't generic.
 * Deliberately conservative: a false "not distinctive" costs 4 points, while a
 * false "distinctive" would let a meaningless negative search add confidence.
 */
export function isDistinctiveName(normalizedName: string | null | undefined): boolean {
  if (typeof normalizedName !== "string") return false;
  const words = normalizedName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.some((word) => word.length > 2 && !GENERIC_NAME_WORDS.has(word));
}
