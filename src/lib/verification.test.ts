import { describe, expect, it } from "vitest";

import { scoreConfidence } from "./confidence";
import { CONFIDENCE_MEDIUM_MIN } from "./domain";
import {
  AMBIGUOUS_CANDIDATE_SCORE,
  CONFIRMED_CANDIDATE_SCORE,
  classifyWebsite,
  domainMatchesName,
  scoreCandidate,
  type CandidateUrl,
  type VerificationInput,
} from "./verification";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUSINESS = {
  name: "Bergstrom Hydronics",
  phone: "(865) 555-0142",
  city: "Knoxville",
  state: "TN",
  zip: "37902",
};

/** All five discovery paths ran — the normal case. */
const ALL_SEARCHES = {
  byName: true,
  byPhone: true,
  byAddress: true,
  byEmailDomain: true,
  bySocial: true,
};

function candidate(overrides: Partial<CandidateUrl> & { url: string }): CandidateUrl {
  return { source: "search_name", reachable: true, pageTitle: null, pageText: null, ...overrides };
}

function input(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    business: BUSINESS,
    facebookUrl: "facebook.com/BergstromHydronics",
    facebookProfileListsWebsite: false,
    providerWebsiteUri: null,
    emailDomain: null,
    candidateUrls: [],
    searchesAttempted: ALL_SEARCHES,
    ...overrides,
  };
}

/** A candidate that will score above the confirmed threshold. */
function strongCandidate(url: string, extra: Partial<CandidateUrl> = {}): CandidateUrl {
  return candidate({
    url,
    pageTitle: "Bergstrom Hydronics — Knoxville TN",
    pageText: "Call us at (865) 555-0142. 100 Gay St, Knoxville, TN 37902.",
    ...extra,
  });
}

// ---------------------------------------------------------------------------

describe("domainMatchesName", () => {
  it("matches an exact compacted name", () => {
    expect(domainMatchesName("bergstromhydronics.com", "bergstrom hydronics")).toBe(true);
  });

  it("matches a close variant", () => {
    expect(domainMatchesName("bergstromhydronic.com", "bergstrom hydronics")).toBe(true);
  });

  it("matches an acronym of three or more letters", () => {
    expect(domainMatchesName("bhs.com", "bergstrom hydronics supply")).toBe(true);
  });

  it("does not match a two-letter acronym, which is too weak", () => {
    expect(domainMatchesName("bh.com", "bergstrom hydronics")).toBe(false);
  });

  it("rejects an unrelated domain", () => {
    expect(domainMatchesName("riversidedental.com", "bergstrom hydronics")).toBe(false);
  });

  it("handles an empty name", () => {
    expect(domainMatchesName("example.com", "")).toBe(false);
  });
});

describe("scoreCandidate", () => {
  it("scores a domain-name match", () => {
    const { score } = scoreCandidate(
      candidate({ url: "https://bergstromhydronics.com" }),
      BUSINESS,
    );
    expect(score).toBe(40);
  });

  it("scores a phone match regardless of the page's formatting", () => {
    const { score, reasons } = scoreCandidate(
      candidate({ url: "https://unrelated.com", pageText: "Reach us on 865.555.0142 today" }),
      BUSINESS,
    );
    expect(score).toBe(25);
    expect(reasons).toContain("Page lists the business phone number");
  });

  it("scores a location match", () => {
    const { score } = scoreCandidate(
      candidate({ url: "https://unrelated.com", pageText: "Serving Knoxville, TN since 1994" }),
      BUSINESS,
    );
    expect(score).toBe(15);
  });

  it("scores a title match only with two or more real name tokens", () => {
    const one = scoreCandidate(
      candidate({ url: "https://unrelated.com", pageTitle: "Bergstrom" }),
      BUSINESS,
    );
    const two = scoreCandidate(
      candidate({ url: "https://unrelated.com", pageTitle: "Bergstrom Hydronics Ltd" }),
      BUSINESS,
    );
    expect(one.score).toBe(0);
    expect(two.score).toBe(10);
  });

  it("gives an email-domain candidate a head start", () => {
    const { score } = scoreCandidate(
      candidate({ url: "https://unrelated.com", source: "email_domain" }),
      BUSINESS,
    );
    expect(score).toBe(10);
  });

  it("penalizes an unreachable site", () => {
    const { score } = scoreCandidate(
      candidate({ url: "https://bergstromhydronics.com", reachable: false }),
      BUSINESS,
    );
    expect(score).toBe(10); // 40 - 30
  });

  it("never returns a negative score", () => {
    const { score } = scoreCandidate(
      candidate({ url: "https://unrelated.com", reachable: false }),
      BUSINESS,
    );
    expect(score).toBe(0);
  });

  it("returns zero for an unparseable URL", () => {
    expect(scoreCandidate(candidate({ url: "not a url" }), BUSINESS).score).toBe(0);
  });

  it("accumulates corroborating signals past the confirmed threshold", () => {
    const { score } = scoreCandidate(strongCandidate("https://bergstromhydronics.com"), BUSINESS);
    expect(score).toBeGreaterThanOrEqual(CONFIRMED_CANDIDATE_SCORE);
  });
});

// ---------------------------------------------------------------------------

describe("classifyWebsite — website found", () => {
  it("reports a confirmed independent site", () => {
    const result = classifyWebsite(
      input({ candidateUrls: [strongCandidate("https://bergstromhydronics.com")] }),
    );
    expect(result.status).toBe("website_found");
    expect(result.qualified).toBe(false);
    expect(result.potentialWebsiteUrl).toBe("https://bergstromhydronics.com");
  });

  it("accepts a provider-supplied website on weaker corroboration", () => {
    // The listing itself is evidence, so a provider URI clears a lower bar
    // than an unattributed search hit.
    const result = classifyWebsite(
      input({
        providerWebsiteUri: "https://bergstromhydronics.com",
        candidateUrls: [candidate({ url: "https://bergstromhydronics.com", source: "provider" })],
      }),
    );
    expect(result.status).toBe("website_found");
  });

  it("scores a website_found lead near zero confidence", () => {
    const result = classifyWebsite(
      input({ candidateUrls: [strongCandidate("https://bergstromhydronics.com")] }),
    );
    const confidence = scoreConfidence(result.signals, result.status);
    expect(confidence.score).toBeLessThanOrEqual(10);
  });
});

describe("classifyWebsite — the qualifying statuses", () => {
  it("reports facebook_only when the Facebook page is the only presence", () => {
    const result = classifyWebsite(input({ candidateUrls: [] }));
    expect(result.status).toBe("facebook_only");
    expect(result.qualified).toBe(true);
  });

  it("reports no_website_found when other non-website listings exist", () => {
    const result = classifyWebsite(
      input({
        candidateUrls: [
          candidate({ url: "https://www.yelp.com/biz/bergstrom-hydronics" }),
          candidate({ url: "https://instagram.com/bergstromhydronics" }),
        ],
      }),
    );
    expect(result.status).toBe("no_website_found");
    expect(result.qualified).toBe(true);
  });

  it("can reach high confidence on a clean qualifying lead", () => {
    const result = classifyWebsite(
      input({
        emailDomain: "gmail.com",
        candidateUrls: [candidate({ url: "https://www.yelp.com/biz/bergstrom-hydronics" })],
      }),
    );
    const confidence = scoreConfidence(result.signals, result.status);
    expect(result.qualified).toBe(true);
    expect(confidence.score).toBeGreaterThanOrEqual(CONFIDENCE_MEDIUM_MIN);
  });
});

describe("classifyWebsite — never overclaiming", () => {
  it("sends an ambiguous candidate to manual review rather than guessing", () => {
    // A domain that matches the name exactly, but which we could not fetch to
    // corroborate. Suggestive; not proof that this business owns it.
    const ambiguous = candidate({
      url: "https://bergstromhydronics.net",
      reachable: null,
    });
    const score = scoreCandidate(ambiguous, BUSINESS).score;
    expect(score).toBeGreaterThanOrEqual(AMBIGUOUS_CANDIDATE_SCORE);
    expect(score).toBeLessThan(CONFIRMED_CANDIDATE_SCORE);

    const result = classifyWebsite(input({ candidateUrls: [ambiguous] }));
    expect(result.status).toBe("needs_manual_review");
    expect(result.qualified).toBe(false);
  });

  it("refuses to conclude anything when the provider errored", () => {
    const result = classifyWebsite(input({ providerErrors: 2 }));
    expect(result.status).toBe("unable_to_verify");
    expect(result.qualified).toBe(false);
  });

  it("refuses to conclude anything when barely any checks ran", () => {
    // "No website found" would be a claim about the world based on not looking.
    const result = classifyWebsite(
      input({
        searchesAttempted: {
          byName: true,
          byPhone: false,
          byAddress: false,
          byEmailDomain: false,
          bySocial: false,
        },
      }),
    );
    expect(result.status).toBe("unable_to_verify");
    expect(result.notes[0]).toMatch(/1 of 5/);
  });

  it("sends a business with its own email domain to review", () => {
    // An address at the business's own domain is strong evidence a site exists
    // that we simply failed to find. Claiming "no website" here would be wrong
    // more often than not.
    const result = classifyWebsite(input({ emailDomain: "bergstromhydronics.com" }));
    expect(result.status).toBe("needs_manual_review");
    expect(result.qualified).toBe(false);
    expect(result.notes[0]).toMatch(/own domain/i);
  });

  it("does not treat a free-provider email as evidence of a website", () => {
    const result = classifyWebsite(input({ emailDomain: "gmail.com" }));
    expect(result.status).toBe("facebook_only");
    expect(result.qualified).toBe(true);
  });

  it("NEVER qualifies a lead without a confirmed Facebook page", () => {
    // The central rule. No website found + no Facebook page is an unverified
    // business, not a lead.
    const result = classifyWebsite(input({ facebookUrl: null }));
    expect(result.status).toBe("needs_manual_review");
    expect(result.qualified).toBe(false);
    expect(result.notes[0]).toMatch(/no Facebook business page has been confirmed/i);
  });

  it("qualified is false for every non-qualifying status", () => {
    const cases: VerificationInput[] = [
      input({ candidateUrls: [strongCandidate("https://bergstromhydronics.com")] }),
      input({ providerErrors: 1 }),
      input({ facebookUrl: null }),
      input({ emailDomain: "bergstromhydronics.com" }),
    ];
    for (const testCase of cases) {
      const result = classifyWebsite(testCase);
      expect(result.qualified).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The spec's named edge cases
// ---------------------------------------------------------------------------

describe("spec edge cases", () => {
  it("a Facebook page that lists no website", () => {
    const result = classifyWebsite(
      input({ facebookProfileListsWebsite: false, candidateUrls: [] }),
    );
    expect(result.status).toBe("facebook_only");
    expect(result.signals.fb_profile_lists_no_website).toBe(true);
  });

  it("a Facebook page that links only to Instagram", () => {
    // Instagram is another social profile, not a website.
    const result = classifyWebsite(
      input({
        candidateUrls: [
          candidate({
            url: "https://instagram.com/bergstromhydronics",
            source: "facebook_profile",
          }),
        ],
      }),
    );
    expect(result.status).toBe("no_website_found");
    expect(result.qualified).toBe(true);
  });

  it("search results contain a Yelp page but no business website", () => {
    const result = classifyWebsite(
      input({
        candidateUrls: [
          candidate({
            url: "https://www.yelp.com/biz/bergstrom-hydronics-knoxville",
            source: "directory",
            pageText: "Bergstrom Hydronics, Knoxville, TN 37902. (865) 555-0142",
          }),
        ],
      }),
    );
    expect(result.status).toBe("no_website_found");
    // Even though the Yelp page matches name, phone AND location perfectly,
    // it is never scored as the business's website.
    expect(result.candidates[0].score).toBe(0);
    expect(result.signals.directories_show_no_website).toBe(true);
  });

  it("a business using a marketplace storefront", () => {
    const storefront = candidate({
      url: "https://bergstromhydronics.square.site",
      pageTitle: "Bergstrom Hydronics",
      pageText: "(865) 555-0142 Knoxville, TN 37902",
    });

    const strict = classifyWebsite(input({ candidateUrls: [storefront] }));
    expect(strict.status).toBe("no_website_found");
    expect(strict.qualified).toBe(true);

    const lenient = classifyWebsite(
      input({ candidateUrls: [storefront], countMarketplaceAsWebsite: true }),
    );
    expect(lenient.status).toBe("website_found");
    expect(lenient.qualified).toBe(false);
  });

  it("a website found under a slightly different business name", () => {
    // Name similarity alone is not enough; corroborating detail decides.
    const nameOnly = candidate({ url: "https://bergstrom-hydronic-services.com" });
    expect(scoreCandidate(nameOnly, BUSINESS).score).toBeLessThan(CONFIRMED_CANDIDATE_SCORE);

    const withPhone = candidate({
      url: "https://bergstrom-hydronic-services.com",
      pageText: "Call 865-555-0142",
    });
    const result = classifyWebsite(input({ candidateUrls: [withPhone] }));
    expect(result.status).toBe("website_found");
  });

  it("no email can be found", () => {
    const result = classifyWebsite(input({ emailDomain: null }));
    expect(result.status).toBe("facebook_only");
    expect(result.signals.no_own_domain_email).toBe(true);
  });

  it("search provider limits are reached mid-verification", () => {
    const result = classifyWebsite(input({ providerErrors: 1 }));
    expect(result.status).toBe("unable_to_verify");
    const confidence = scoreConfidence(result.signals, result.status);
    expect(confidence.score).toBeLessThan(CONFIDENCE_MEDIUM_MIN);
  });
});

// ---------------------------------------------------------------------------

describe("signals", () => {
  it("marks an unread Facebook profile as unknown, not as 'lists no website'", () => {
    const result = classifyWebsite(input({ facebookProfileListsWebsite: null }));
    expect(result.signals.fb_profile_lists_no_website).toBeNull();
  });

  it("marks a search path that never ran as unknown", () => {
    const result = classifyWebsite(
      input({
        searchesAttempted: { ...ALL_SEARCHES, byPhone: false, byAddress: false },
      }),
    );
    expect(result.signals.no_site_in_phone_search).toBeNull();
    expect(result.signals.no_site_in_address_search).toBeNull();
    expect(result.signals.no_site_in_name_search).toBe(true);
  });

  it("marks provider_no_website_uri true when the listing points at Facebook", () => {
    const result = classifyWebsite(
      input({ providerWebsiteUri: "https://facebook.com/BergstromHydronics" }),
    );
    expect(result.signals.provider_no_website_uri).toBe(true);
  });

  it("marks provider_no_website_uri false when the listing names a real site", () => {
    const result = classifyWebsite(
      input({
        providerWebsiteUri: "https://bergstromhydronics.com",
        candidateUrls: [strongCandidate("https://bergstromhydronics.com", { source: "provider" })],
      }),
    );
    expect(result.signals.provider_no_website_uri).toBe(false);
  });

  it("marks only_social_or_directory when nothing independent turned up", () => {
    const result = classifyWebsite(
      input({
        candidateUrls: [
          candidate({ url: "https://www.yelp.com/biz/x" }),
          candidate({ url: "https://instagram.com/x" }),
        ],
      }),
    );
    expect(result.signals.only_social_or_directory).toBe(true);
  });

  it("leaves only_social_or_directory unknown when there were no candidates", () => {
    const result = classifyWebsite(input({ candidateUrls: [] }));
    expect(result.signals.only_social_or_directory).toBeNull();
  });

  it("reflects name distinctiveness", () => {
    expect(classifyWebsite(input()).signals.name_is_distinctive).toBe(true);
    expect(
      classifyWebsite(input({ business: { ...BUSINESS, name: "Quality Home Services" } })).signals
        .name_is_distinctive,
    ).toBe(false);
  });
});

describe("user domain rules", () => {
  it("honours a user-added excluded domain", () => {
    const result = classifyWebsite(
      input({
        userDomainRules: [{ domain: "localbizhub.example", kind: "directory", enabled: true }],
        candidateUrls: [strongCandidate("https://bergstromhydronics.localbizhub.example")],
      }),
    );
    expect(result.status).toBe("no_website_found");
  });

  it("honours a user disabling a built-in exclusion", () => {
    const storefront = candidate({
      url: "https://bergstromhydronics.square.site",
      pageText: "(865) 555-0142 Knoxville, TN 37902",
      pageTitle: "Bergstrom Hydronics",
    });

    // Default rules: a Square storefront is not a website, so this is a lead.
    expect(classifyWebsite(input({ candidateUrls: [storefront] })).status).toBe("no_website_found");

    // With square.site disabled, the same URL is scored like any other domain.
    const result = classifyWebsite(
      input({
        userDomainRules: [{ domain: "square.site", kind: "marketplace", enabled: false }],
        candidateUrls: [storefront],
      }),
    );
    expect(result.status).toBe("website_found");
    expect(result.qualified).toBe(false);
  });
});

describe("result shape", () => {
  it("always returns exactly one deciding note", () => {
    for (const testCase of [
      input(),
      input({ facebookUrl: null }),
      input({ providerErrors: 1 }),
      input({ candidateUrls: [strongCandidate("https://bergstromhydronics.com")] }),
    ]) {
      expect(classifyWebsite(testCase).notes).toHaveLength(1);
      expect(classifyWebsite(testCase).notes[0].length).toBeGreaterThan(20);
    }
  });

  it("returns every candidate with its classification, including excluded ones", () => {
    const result = classifyWebsite(
      input({
        candidateUrls: [
          candidate({ url: "https://www.yelp.com/biz/x" }),
          candidate({ url: "https://facebook.com/BergstromHydronics" }),
          candidate({ url: "https://bergstromhydronics.com" }),
        ],
      }),
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((c) => c.classification)).toEqual([
      "directory",
      "facebook",
      "independent",
    ]);
  });
});
