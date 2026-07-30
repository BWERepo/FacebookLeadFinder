/**
 * The compliant-data-source abstraction.
 *
 * Every candidate business the app ever sees comes through one of these. That
 * boundary is what keeps the compliance story simple: nothing outside this
 * folder talks to a search API or fetches a web page, so "did we scrape
 * Facebook" is a question with an answer you can find by reading five files
 * instead of auditing the whole app. See COMPLIANCE.md.
 *
 * A provider never classifies anything — it reports what it found (a page, a
 * listing, an email string) and `src/lib/verification.ts` decides what it
 * means. That split is what makes verification testable without a network.
 */

import type { CandidateSource, CandidateUrl } from "@/lib/verification";
import type { EmailStatus } from "@/lib/domain";
import type { SearchCriteria } from "@/lib/search-criteria";

export type ProviderName = "mock" | "google_places" | "bing" | "brave" | "serpapi";

/** A business as reported by a provider, before any verification. */
export type RawBusiness = {
  /** Provider-specific identifier, used for exact-match dedupe. */
  providerId: string;
  name: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  /** The category as the provider's own taxonomy names it. */
  category: string;
  /** The provider's own "website" field, if it has one. Never assumed correct. */
  websiteUri: string | null;
  /** A link to the provider's own listing — recorded as a source, never as a website. */
  listingUrl: string | null;
};

export type ProviderCursor = {
  /** Opaque pagination token from the provider's previous page, if any. */
  pageToken?: string | null;
  /** Precomputed ZIP queue for county/area-code searches (see job-state.ts). */
  zipQueue?: readonly string[];
  zipIndex?: number;
};

export type SearchPage = {
  businesses: readonly RawBusiness[];
  nextPageToken: string | null;
  /** Outbound calls this page cost, for the job's provider_calls counter. */
  calls: number;
};

export type FacebookPageResult = {
  url: string | null;
  source: CandidateSource;
  /** `null` when the profile couldn't be read, not the same as "lists none". */
  profileListsWebsite: boolean | null;
};

export type EmailResult = {
  email: string | null;
  status: EmailStatus;
  source: CandidateSource;
};

export type VerifyResult = {
  reachable: boolean;
  pageTitle: string | null;
  pageText: string | null;
};

/**
 * Thrown when a provider has no usable credentials. The registry catches this
 * to fall back to the mock provider rather than failing the whole job.
 */
export class ProviderNotConfigured extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`${provider} is not configured`);
    this.name = "ProviderNotConfigured";
  }
}

/** Thrown on an authentication failure — a bad or revoked key, not a rate limit. */
export class ProviderAuthError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`${provider} rejected its credentials`);
    this.name = "ProviderAuthError";
  }
}

/** Thrown after retries are exhausted on a 429/5xx. Caught per-candidate, not fatal to the job. */
export class ProviderRateLimited extends Error {
  constructor(
    public readonly provider: ProviderName,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(`${provider} is rate limiting requests`);
    this.name = "ProviderRateLimited";
  }
}

export interface SearchProvider {
  readonly name: ProviderName;
  /** False when credentials are absent; the registry never returns an unavailable provider. */
  readonly available: boolean;

  /** One page of candidates for the given criteria. */
  searchBusinesses(criteria: SearchCriteria, cursor: ProviderCursor): Promise<SearchPage>;

  /** Look for a Facebook business page for this listing, from compliant sources only. */
  findFacebookPage(business: RawBusiness): Promise<FacebookPageResult>;

  /**
   * Look for a publicly listed email address.
   *
   * MUST NOT construct or guess an address (no `firstname@domain` patterns).
   * Only an address literally present in fetched public content may be
   * returned. See COMPLIANCE.md and email-discovery.test.ts, which asserts
   * this module has no address-construction code path.
   */
  findPublicEmail(business: RawBusiness): Promise<EmailResult>;

  /** Every URL worth considering as this business's independent website. */
  findPotentialWebsite(business: RawBusiness): Promise<CandidateUrl[]>;

  /** Fetch a candidate URL to see if it's live and what it says. */
  verifyWebsite(url: string): Promise<VerifyResult>;
}
