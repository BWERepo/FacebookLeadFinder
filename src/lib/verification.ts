/**
 * Website verification — deciding, from collected evidence, whether a business
 * has a website of its own.
 *
 * **This module performs no I/O.** Every fetch happens upstream in the provider
 * layer, which hands `classifyWebsite` a fully populated `candidateUrls` array.
 * That separation is deliberate: this is the function that decides what the
 * product claims about a real business, so it has to be exhaustively testable
 * without a network, a database, or a paid API key.
 *
 * The governing rule, from the spec: a lead is qualified only when it has a
 * confirmed Facebook business page AND no separate website could be found.
 * Anything uncertain becomes `needs_manual_review` — never a qualifying status.
 */

import {
  classifyUrl,
  countsAsWebsite,
  mergeDomainRules,
  type DomainClassification,
  type DomainRule,
} from "@/lib/excluded-domains";
import { emptySignals, isDistinctiveName, type ConfidenceSignals } from "@/lib/confidence";
import { diceCoefficient, normalizeBusinessName, normalizePhone } from "@/lib/dedupe";
import { isFreeEmailDomain, normalizeUrl } from "@/lib/url";
import type { WebsiteStatus } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Where a candidate URL came from. Provenance affects how much it's trusted. */
export type CandidateSource =
  | "provider"
  | "search_name"
  | "search_phone"
  | "search_address"
  | "email_domain"
  | "facebook_profile"
  | "directory"
  | "manual";

export type CandidateUrl = {
  url: string;
  source: CandidateSource;
  /** `null` when the URL was never fetched. Not the same as unreachable. */
  reachable: boolean | null;
  pageTitle: string | null;
  /** Visible page text, truncated upstream. `null` when never fetched. */
  pageText: string | null;
};

/** Which of the five discovery paths actually ran. */
export type SearchesAttempted = {
  byName: boolean;
  byPhone: boolean;
  byAddress: boolean;
  byEmailDomain: boolean;
  bySocial: boolean;
};

export type VerificationInput = {
  business: {
    name: string;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  /** Canonical Facebook page URL, or null if none has been confirmed. */
  facebookUrl: string | null;
  /** `null` when we couldn't read the profile — not the same as false. */
  facebookProfileListsWebsite: boolean | null;
  /** The `websiteUri` (or equivalent) from the search provider's listing. */
  providerWebsiteUri: string | null;
  /** Domain of a publicly listed business email, if one was found. */
  emailDomain: string | null;
  candidateUrls: readonly CandidateUrl[];
  /** User's excluded-domain rows; merged over the built-in catalogue. */
  userDomainRules?: readonly DomainRule[];
  countMarketplaceAsWebsite?: boolean;
  countGoogleBusinessAsWebsite?: boolean;
  /** Provider failures during this candidate's verification. */
  providerErrors?: number;
  searchesAttempted: SearchesAttempted;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type ScoredCandidate = {
  url: string;
  source: CandidateSource;
  classification: DomainClassification;
  score: number;
  /** Which scoring signals fired, for the details page. */
  reasons: string[];
};

export type VerificationResult = {
  status: WebsiteStatus;
  qualified: boolean;
  potentialWebsiteUrl: string | null;
  /** Human-readable explanation. The first entry is the deciding reason. */
  notes: string[];
  signals: ConfidenceSignals;
  candidates: ScoredCandidate[];
};

// ---------------------------------------------------------------------------
// Candidate scoring
// ---------------------------------------------------------------------------

/** At or above this, a candidate is accepted as the business's website. */
export const CONFIRMED_CANDIDATE_SCORE = 55;
/** Between this and CONFIRMED, a candidate is suggestive but not conclusive. */
export const AMBIGUOUS_CANDIDATE_SCORE = 30;
/** A provider-supplied URL needs less corroboration — the listing asserts it. */
export const PROVIDER_CANDIDATE_SCORE = 40;

/** Name-to-domain similarity above which the domain is taken as a match. */
const DOMAIN_NAME_SIMILARITY = 0.6;

/** Words too common to count toward a title match. */
const WEAK_TITLE_TOKENS = new Set(["the", "and", "for", "inc", "llc", "co"]);

function nameTokens(normalizedName: string): string[] {
  return normalizedName.split(/\s+/).filter((t) => t.length >= 3 && !WEAK_TITLE_TOKENS.has(t));
}

/** Initials of a multi-word name: "bergstrom hydronics supply" -> "bhs". */
function acronymOf(normalizedName: string): string {
  return normalizedName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
}

/**
 * Does the domain look like it belongs to this business?
 *
 * Compares the first label of the registrable domain ("joesplumbing" of
 * joesplumbing.com) against the normalized name with spaces removed, plus an
 * acronym check for names that abbreviate.
 */
export function domainMatchesName(host: string, normalizedName: string): boolean {
  if (normalizedName === "") return false;

  const label = host.split(".")[0].replace(/[^a-z0-9]/g, "");
  if (label === "") return false;

  const compact = normalizedName.replace(/\s+/g, "");
  if (label === compact) return true;
  if (diceCoefficient(label, compact) >= DOMAIN_NAME_SIMILARITY) return true;

  const acronym = acronymOf(normalizedName);
  if (acronym.length >= 3 && label === acronym) return true;

  return false;
}

/**
 * Score how likely it is that a candidate URL is THIS business's website.
 *
 * Only meaningful for candidates classified `independent` — a Yelp page scoring
 * well on name match is still a Yelp page.
 */
export function scoreCandidate(
  candidate: CandidateUrl,
  business: VerificationInput["business"],
): { score: number; reasons: string[] } {
  const normalized = normalizeUrl(candidate.url);
  if (!normalized) return { score: 0, reasons: [] };

  const normalizedName = normalizeBusinessName(business.name);
  const reasons: string[] = [];
  let score = 0;

  if (domainMatchesName(normalized.host, normalizedName)) {
    score += 40;
    reasons.push("Domain matches the business name");
  }

  const text = candidate.pageText ?? "";
  const digitsOnly = text.replace(/\D/g, "");
  const phone = normalizePhone(business.phone);
  if (phone && digitsOnly.includes(phone)) {
    // Compared digits-only so the page's formatting doesn't matter.
    score += 25;
    reasons.push("Page lists the business phone number");
  }

  const lowerText = text.toLowerCase();
  const cityState =
    business.city && business.state ? `${business.city}, ${business.state}`.toLowerCase() : null;
  if (
    (business.zip && text.includes(business.zip)) ||
    (cityState && lowerText.includes(cityState))
  ) {
    score += 15;
    reasons.push("Page lists the business location");
  }

  const title = (candidate.pageTitle ?? "").toLowerCase();
  const tokens = nameTokens(normalizedName);
  const matchedTokens = tokens.filter((token) => title.includes(token));
  if (matchedTokens.length >= 2) {
    score += 10;
    reasons.push("Page title contains the business name");
  }

  if (candidate.source === "email_domain") {
    // A business with an address at its own domain almost always has a site
    // there too.
    score += 10;
    reasons.push("Domain comes from the business's own email address");
  }

  if (candidate.reachable === false) {
    // A parked or dead domain is not a website. Subtracted rather than
    // disqualifying, so a strong name match still surfaces for review.
    score -= 30;
    reasons.push("Site did not respond");
  }

  return { score: Math.max(0, score), reasons };
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

function classificationOf(
  url: string,
  rules: readonly DomainRule[],
): { classification: DomainClassification; host: string | null } {
  const { classification, normalized } = classifyUrl(url, rules);
  return { classification, host: normalized?.host ?? null };
}

export function classifyWebsite(input: VerificationInput): VerificationResult {
  const rules = mergeDomainRules(input.userDomainRules ?? []);
  const countMarketplace = input.countMarketplaceAsWebsite ?? false;
  const countGoogleBusiness = input.countGoogleBusinessAsWebsite ?? false;
  const providerErrors = input.providerErrors ?? 0;
  const normalizedName = normalizeBusinessName(input.business.name);

  // --- score every candidate ----------------------------------------------
  const candidates: ScoredCandidate[] = input.candidateUrls.map((candidate) => {
    const { classification } = classificationOf(candidate.url, rules);
    const scoreable = countsAsWebsite(classification, { countMarketplace, countGoogleBusiness });
    const { score, reasons } = scoreable
      ? scoreCandidate(candidate, input.business)
      : { score: 0, reasons: [] };
    return { url: candidate.url, source: candidate.source, classification, score, reasons };
  });

  const websiteCandidates = candidates
    .filter((c) => countsAsWebsite(c.classification, { countMarketplace, countGoogleBusiness }))
    .sort((a, b) => b.score - a.score);
  const best = websiteCandidates[0] ?? null;

  // The provider's own website field, interpreted.
  const providerClassification = input.providerWebsiteUri
    ? classificationOf(input.providerWebsiteUri, rules).classification
    : null;
  const providerCandidate = input.providerWebsiteUri
    ? (candidates.find((c) => c.url === input.providerWebsiteUri) ?? null)
    : null;

  const searchesRun = Object.values(input.searchesAttempted).filter(Boolean).length;
  const hasFacebook = input.facebookUrl !== null && input.facebookUrl !== "";
  const ownDomainEmail =
    input.emailDomain !== null && input.emailDomain !== "" && !isFreeEmailDomain(input.emailDomain);

  // --- signals for the confidence rubric -----------------------------------
  const signals = buildSignals({
    input,
    candidates,
    websiteCandidates,
    providerClassification,
    normalizedName,
    hasFacebook,
    ownDomainEmail,
  });

  const decide = (
    status: WebsiteStatus,
    note: string,
    potentialWebsiteUrl: string | null = null,
  ): VerificationResult => ({
    status,
    // A qualifying status is necessary but not sufficient — a confirmed
    // Facebook page is the other half, and is re-checked here rather than
    // trusted from the status alone.
    qualified: (status === "no_website_found" || status === "facebook_only") && hasFacebook,
    potentialWebsiteUrl,
    notes: [note],
    signals,
    candidates,
  });

  // 1. A candidate we're confident about. Contrary evidence wins outright.
  if (best && best.score >= CONFIRMED_CANDIDATE_SCORE) {
    return decide("website_found", `An independent website was identified: ${best.url}`, best.url);
  }

  // 2. The provider's listing names a website. The listing itself is evidence,
  //    so this clears a lower bar than an unattributed search result.
  if (
    providerClassification &&
    countsAsWebsite(providerClassification, { countMarketplace, countGoogleBusiness }) &&
    (providerCandidate?.score ?? 0) >= PROVIDER_CANDIDATE_SCORE
  ) {
    return decide(
      "website_found",
      `The provider listing points at a website: ${input.providerWebsiteUri}`,
      input.providerWebsiteUri,
    );
  }

  // 3. Something turned up, but not convincingly. Never guess in either
  //    direction — this is exactly the case the spec says a human must see.
  if (best && best.score >= AMBIGUOUS_CANDIDATE_SCORE) {
    return decide(
      "needs_manual_review",
      `A possible website was found but could not be confirmed as this business: ${best.url}`,
      best.url,
    );
  }

  // 4. Verification didn't really happen. Saying "no website" here would be a
  //    claim about the world based on not having looked.
  if (providerErrors > 0) {
    return decide(
      "unable_to_verify",
      "The search provider returned errors, so website checks are incomplete.",
    );
  }
  if (searchesRun < 2) {
    return decide(
      "unable_to_verify",
      `Only ${searchesRun} of 5 website checks ran, which is too few to conclude anything.`,
    );
  }

  // 5. An email at the business's own domain is strong evidence a site exists
  //    that we simply failed to find. Reviewing beats claiming.
  if (ownDomainEmail) {
    return decide(
      "needs_manual_review",
      `No website was found, but the business uses an email at its own domain (${input.emailDomain}), which usually means one exists.`,
    );
  }

  // 6. No website AND no Facebook page is not a qualified lead — it's an
  //    unverified business. This row is why "no website found" can never be
  //    reported without the Facebook half of the claim.
  if (!hasFacebook) {
    return decide(
      "needs_manual_review",
      "No independent website was found, but no Facebook business page has been confirmed from a compliant source.",
    );
  }

  // 7. Facebook page confirmed and nothing else at all. The cleanest lead.
  const nonFacebookPresence = candidates.filter((c) => c.classification !== "facebook");
  if (nonFacebookPresence.length === 0) {
    return decide("facebook_only", "The business's only web presence found is its Facebook page.");
  }

  // 8. Facebook page confirmed, other listings exist, but none is a website.
  return decide(
    "no_website_found",
    `A Facebook page was confirmed and no independent website was found (${nonFacebookPresence.length} other listing${nonFacebookPresence.length === 1 ? "" : "s"} checked).`,
  );
}

// ---------------------------------------------------------------------------

function buildSignals(args: {
  input: VerificationInput;
  candidates: ScoredCandidate[];
  websiteCandidates: ScoredCandidate[];
  providerClassification: DomainClassification | null;
  normalizedName: string;
  hasFacebook: boolean;
  ownDomainEmail: boolean;
}): ConfidenceSignals {
  const {
    input,
    candidates,
    websiteCandidates,
    providerClassification,
    normalizedName,
    hasFacebook,
    ownDomainEmail,
  } = args;

  const signals = emptySignals();

  signals.facebook_page_confirmed = hasFacebook;

  // Tri-state: we may simply not have been able to read the profile.
  signals.fb_profile_lists_no_website =
    input.facebookProfileListsWebsite === null ? null : !input.facebookProfileListsWebsite;

  /** Did a given discovery path turn up a plausible website? */
  const noSiteFrom = (source: CandidateSource, attempted: boolean): boolean | null => {
    if (!attempted) return null;
    return !websiteCandidates.some(
      (c) => c.source === source && c.score >= AMBIGUOUS_CANDIDATE_SCORE,
    );
  };

  signals.no_site_in_name_search = noSiteFrom("search_name", input.searchesAttempted.byName);
  signals.no_site_in_phone_search = noSiteFrom("search_phone", input.searchesAttempted.byPhone);
  signals.no_site_in_address_search = noSiteFrom(
    "search_address",
    input.searchesAttempted.byAddress,
  );

  signals.provider_no_website_uri =
    input.providerWebsiteUri === null
      ? true
      : providerClassification === "facebook"
        ? true
        : providerClassification === "independent"
          ? false
          : // A provider URI pointing at a directory or storefront is neither
            // a website nor an absence of one.
            false;

  signals.no_own_domain_email = input.searchesAttempted.byEmailDomain ? !ownDomainEmail : null;

  const directoryCandidates = candidates.filter((c) => c.classification === "directory");
  signals.directories_show_no_website =
    directoryCandidates.length === 0
      ? null
      : !websiteCandidates.some((c) => c.score >= AMBIGUOUS_CANDIDATE_SCORE);

  signals.name_is_distinctive = isDistinctiveName(normalizedName);

  signals.only_social_or_directory =
    candidates.length === 0 ? null : candidates.every((c) => c.classification !== "independent");

  return signals;
}
