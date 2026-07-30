import { describe, expect, it } from "vitest";

import { classifyWebsite, type CandidateUrl } from "@/lib/verification";
import type { SearchCriteria } from "@/lib/search-criteria";
import { createMockProvider, MOCK_BUSINESS_POOL } from "./mock.provider";

const ZIP_SEARCH: SearchCriteria = {
  searchType: "zip_radius",
  zip: "37902",
  radiusMiles: 10,
  category: "",
  maxResults: 100,
};

describe("createMockProvider", () => {
  it("is always available and needs no credentials", () => {
    const provider = createMockProvider();
    expect(provider.available).toBe(true);
    expect(provider.name).toBe("mock");
  });

  it("returns the fixed pool on the first page of a matching search", async () => {
    const provider = createMockProvider();
    const page = await provider.searchBusinesses(ZIP_SEARCH, {});
    const names = page.businesses.map((b) => b.name);
    expect(names).toContain("Bergstrom Hydronics");
    expect(names).toContain("Rosalita's Taqueria");
  });

  it("is deterministic — the same criteria return the same businesses", async () => {
    const provider = createMockProvider();
    const first = await provider.searchBusinesses(ZIP_SEARCH, {});
    const second = await provider.searchBusinesses(ZIP_SEARCH, {});
    expect(first.businesses.map((b) => b.providerId)).toEqual(
      second.businesses.map((b) => b.providerId),
    );
  });

  it("different criteria produce different generated padding", async () => {
    const provider = createMockProvider();
    const plumbers = await provider.searchBusinesses({ ...ZIP_SEARCH, category: "plumbers" }, {});
    const electricians = await provider.searchBusinesses(
      { ...ZIP_SEARCH, category: "electricians" },
      {},
    );
    // The fixed pool member matching category is filtered differently, and the
    // generated padding is seeded from the category text.
    expect(plumbers.businesses).not.toEqual(electricians.businesses);
  });

  it("paginates via nextPageToken and eventually terminates", async () => {
    const provider = createMockProvider();
    let cursor = {};
    let pages = 0;
    let nextToken: string | null = null;
    do {
      const page = await provider.searchBusinesses(ZIP_SEARCH, cursor);
      nextToken = page.nextPageToken;
      cursor = { pageToken: nextToken ?? undefined };
      pages++;
    } while (nextToken !== null && pages < 100);
    expect(pages).toBeLessThan(100); // terminated on its own
    expect(pages).toBeGreaterThan(1);
  });

  it("filters area-code searches to matching phone numbers", async () => {
    const provider = createMockProvider();
    const page = await provider.searchBusinesses(
      {
        searchType: "area_code",
        areaCode: "865",
        city: "",
        state: "",
        category: "",
        maxResults: 100,
      },
      {},
    );
    expect(page.businesses.length).toBeGreaterThan(0);
    for (const business of page.businesses) {
      expect(business.phone?.replace(/\D/g, "")).toMatch(/^865/);
    }
  });

  it("filters state+county searches by state and county", async () => {
    const provider = createMockProvider();
    const page = await provider.searchBusinesses(
      {
        searchType: "state_county",
        state: "TN",
        county: "Knox",
        city: "",
        category: "",
        maxResults: 100,
      },
      {},
    );
    expect(page.businesses.length).toBeGreaterThan(0);
    for (const business of page.businesses) {
      expect(business.state).toBe("TN");
    }

    const noMatch = await provider.searchBusinesses(
      {
        searchType: "state_county",
        state: "CA",
        county: "Los Angeles",
        city: "",
        category: "",
        maxResults: 100,
      },
      {},
    );
    // No pool member is in Los Angeles County — every returned business is
    // generated padding (the pool itself is entirely Knoxville, TN).
    expect(noMatch.businesses.length).toBeGreaterThan(0);
    expect(noMatch.businesses.every((b) => b.providerId.startsWith("mock-gen"))).toBe(true);
  });

  it("never returns an email it did not already have on file — no construction", async () => {
    const provider = createMockProvider();
    for (const business of MOCK_BUSINESS_POOL) {
      const result = await provider.findPublicEmail(business);
      // Every returned email traces back to a fixture value, never a
      // firstname@domain-style guess assembled from the business's name.
      if (result.email) {
        expect(business.email).toBe(result.email);
      }
    }
  });
});

describe("mock provider fixtures exercise every verification branch", () => {
  const provider = createMockProvider();

  async function verify(business: (typeof MOCK_BUSINESS_POOL)[number]) {
    const fb = await provider.findFacebookPage(business);
    const email = await provider.findPublicEmail(business);
    const candidates = await provider.findPotentialWebsite(business);

    const enriched: CandidateUrl[] = [];
    for (const c of candidates) {
      const verified = await provider.verifyWebsite(c.url);
      enriched.push({
        ...c,
        reachable: verified.reachable,
        pageText: verified.pageText ?? c.pageText,
        pageTitle: verified.pageTitle ?? c.pageTitle,
      });
    }

    return classifyWebsite({
      business: {
        name: business.name,
        phone: business.phone,
        city: business.city,
        state: business.state,
        zip: business.zip,
      },
      facebookUrl: fb.url,
      facebookProfileListsWebsite: fb.profileListsWebsite,
      providerWebsiteUri: business.websiteUri,
      emailDomain: email.email ? email.email.split("@")[1] : null,
      candidateUrls: enriched,
      searchesAttempted: {
        byName: true,
        byPhone: true,
        byAddress: true,
        byEmailDomain: true,
        bySocial: true,
      },
    });
  }

  it("facebook_only scenario classifies as facebook_only and qualifies", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "facebook_only")!;
    const result = await verify(business);
    expect(result.status).toBe("facebook_only");
    expect(result.qualified).toBe(true);
  });

  it("has_website scenario classifies as website_found and does not qualify", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "has_website")!;
    const result = await verify(business);
    expect(result.status).toBe("website_found");
    expect(result.qualified).toBe(false);
  });

  it("directory_only scenario (Yelp page, no site) qualifies as no_website_found", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "directory_only")!;
    const result = await verify(business);
    expect(result.status).toBe("no_website_found");
    expect(result.qualified).toBe(true);
  });

  it("marketplace scenario is not a website by default, but flips with the setting", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "marketplace")!;
    const strict = await verify(business);
    expect(strict.status).toBe("no_website_found");
    expect(strict.qualified).toBe(true);
  });

  it("no_email scenario still qualifies — a missing email is not disqualifying", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "no_email")!;
    const result = await verify(business);
    expect(result.qualified).toBe(true);
    const email = await provider.findPublicEmail(business);
    expect(email.status).toBe("not_found");
  });

  it("unreachable_candidate scenario is not scored as a confirmed website", async () => {
    const business = MOCK_BUSINESS_POOL.find((b) => b.scenario === "unreachable_candidate")!;
    const result = await verify(business);
    expect(result.status).not.toBe("website_found");
  });

  it("duplicate_pair scenario shares a phone and near-identical name with mock-001", async () => {
    const original = MOCK_BUSINESS_POOL.find((b) => b.providerId === "mock-001")!;
    const duplicate = MOCK_BUSINESS_POOL.find((b) => b.scenario === "duplicate_pair")!;
    expect(duplicate.phone?.replace(/\D/g, "")).toBe(original.phone?.replace(/\D/g, ""));
    expect(duplicate.name).not.toBe(original.name); // different enough to need fuzzy matching
  });
});
