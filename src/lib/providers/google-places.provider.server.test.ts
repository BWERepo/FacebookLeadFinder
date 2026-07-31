import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGooglePlacesProvider,
  isFacebookWebsiteUri,
  mapPlaceToRawBusiness,
  textQueryFor,
} from "@/lib/providers/google-places.provider.server";
import type {
  ZipRadiusCriteria,
  AreaCodeCriteria,
  StateCountyCriteria,
} from "@/lib/search-criteria";

const SAMPLE_PLACE = {
  id: "ChIJ-sample-1",
  displayName: { text: "Rosalita's Taqueria" },
  formattedAddress: "88 Market Sq, Knoxville, TN 37902, USA",
  addressComponents: [
    { longText: "Knoxville", shortText: "Knoxville", types: ["locality"] },
    { longText: "Knox County", shortText: "Knox County", types: ["administrative_area_level_2"] },
    { longText: "Tennessee", shortText: "TN", types: ["administrative_area_level_1"] },
    { longText: "37902", shortText: "37902", types: ["postal_code"] },
  ],
  location: { latitude: 35.9647, longitude: -83.9198 },
  internationalPhoneNumber: "+1 865-555-0177",
  websiteUri: "https://rosalitastaqueria.com",
  primaryTypeDisplayName: { text: "Restaurant" },
};

describe("mapPlaceToRawBusiness", () => {
  it("extracts city/county/state/zip from address components", () => {
    const business = mapPlaceToRawBusiness(SAMPLE_PLACE, "Restaurants");
    expect(business.city).toBe("Knoxville");
    expect(business.county).toBe("Knox County");
    expect(business.state).toBe("TN");
    expect(business.zip).toBe("37902");
  });

  it("falls back to the category hint when Places has no primary type", () => {
    const business = mapPlaceToRawBusiness(
      { ...SAMPLE_PLACE, primaryTypeDisplayName: undefined },
      "Restaurants",
    );
    expect(business.category).toBe("Restaurants");
  });

  it("never assumes a websiteUri is missing when Places doesn't return one", () => {
    const business = mapPlaceToRawBusiness(
      { ...SAMPLE_PLACE, websiteUri: undefined },
      "Restaurants",
    );
    expect(business.websiteUri).toBeNull();
  });

  it("builds a Maps listing URL from the place id", () => {
    const business = mapPlaceToRawBusiness(SAMPLE_PLACE, "Restaurants");
    expect(business.listingUrl).toContain(SAMPLE_PLACE.id);
  });
});

describe("isFacebookWebsiteUri", () => {
  it("recognizes facebook.com and www.facebook.com", () => {
    expect(isFacebookWebsiteUri("https://facebook.com/SomeBiz")).toBe(true);
    expect(isFacebookWebsiteUri("https://www.facebook.com/SomeBiz")).toBe(true);
  });

  it("rejects an independent domain", () => {
    expect(isFacebookWebsiteUri("https://rosalitastaqueria.com")).toBe(false);
  });

  it("rejects a domain that merely contains 'facebook'", () => {
    expect(isFacebookWebsiteUri("https://facebook.com.evil.example/phish")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isFacebookWebsiteUri(null)).toBe(false);
  });
});

describe("textQueryFor", () => {
  it("builds a near-ZIP query for zip_radius", () => {
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants",
      maxResults: 100,
    };
    expect(textQueryFor(criteria)).toBe("Restaurants near 37902");
  });

  it("builds a city/state query for area_code when a city is given", () => {
    const criteria: AreaCodeCriteria = {
      searchType: "area_code",
      areaCode: "865",
      city: "Knoxville",
      state: "TN",
      category: "Restaurants",
      maxResults: 100,
    };
    expect(textQueryFor(criteria)).toBe("Restaurants in Knoxville, TN");
  });

  it("builds a county-based query for state_county with no city", () => {
    const criteria: StateCountyCriteria = {
      searchType: "state_county",
      state: "TN",
      county: "Knox",
      city: "",
      category: "Restaurants",
      maxResults: 100,
    };
    expect(textQueryFor(criteria)).toBe("Restaurants in Knox, TN");
  });

  it("joins several comma-selected categories with 'or'", () => {
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants, Plumbers",
      maxResults: 100,
    };
    expect(textQueryFor(criteria)).toBe("Restaurants or Plumbers near 37902");
  });
});

describe("createGooglePlacesProvider", () => {
  const originalKey = process.env.GOOGLE_PLACES_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("is unavailable with no API key configured", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const provider = createGooglePlacesProvider();
    expect(provider.available).toBe(false);
  });

  it("is available once an API key is configured", () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const provider = createGooglePlacesProvider();
    expect(provider.available).toBe(true);
  });

  it("sends the mandatory field mask and API key header on every search call", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGooglePlacesProvider();
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants",
      maxResults: 100,
    };
    await provider.searchBusinesses(criteria, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
  });

  it("reports a fallback sentinel (not null) as nextPageToken after a ZIP-radius search's first page, since :searchNearby never paginates on its own", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 })),
    );

    const provider = createGooglePlacesProvider();
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants",
      maxResults: 100,
    };
    const page = await provider.searchBusinesses(criteria, {});
    expect(page.nextPageToken).not.toBeNull();
  });

  it("switches to :searchText once the ZIP-radius fallback sentinel comes back as the cursor", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ places: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGooglePlacesProvider();
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants",
      maxResults: 100,
    };
    const first = await provider.searchBusinesses(criteria, {});
    await provider.searchBusinesses(criteria, { pageToken: first.nextPageToken });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(":searchNearby");
    expect(String(fetchMock.mock.calls[1][0])).toContain(":searchText");
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    // Starting fresh, not sending the sentinel itself as a real Places page token.
    expect(secondBody.pageToken).toBeUndefined();
  });

  it("reports a fallback sentinel (not null) once :searchText genuinely runs out of pages", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 })),
    );

    const provider = createGooglePlacesProvider();
    const criteria: AreaCodeCriteria = {
      searchType: "area_code",
      areaCode: "865",
      city: "Knoxville",
      state: "TN",
      category: "Bakery",
      maxResults: 100,
    };
    const page = await provider.searchBusinesses(criteria, {});
    expect(page.nextPageToken).not.toBeNull();
  });

  it("falls back to a site:facebook.com discovery pass once :searchText is exhausted, confirming each candidate via a real Places lookup", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    process.env.BRAVE_SEARCH_API_KEY = "brave-key";

    const fetchMock = vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Wild Love Bakehouse | Facebook",
                  url: "https://www.facebook.com/wildlovebakehouse",
                  description: "Bakery in Knoxville, TN.",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Places :searchText — used for both the sentinel-triggering exhausted
      // page and the per-candidate lookup that follows.
      return new Response(JSON.stringify({ places: [SAMPLE_PLACE] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGooglePlacesProvider();
    const criteria: AreaCodeCriteria = {
      searchType: "area_code",
      areaCode: "865",
      city: "Knoxville",
      state: "TN",
      category: "Bakery",
      maxResults: 100,
    };

    const page = await provider.searchBusinesses(criteria, {
      pageToken: "__facebook_search_fallback__",
    });

    const braveCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("api.search.brave.com"),
    );
    expect(braveCall).toBeDefined();
    expect(String(braveCall![0])).toContain(encodeURIComponent("site:facebook.com"));
    expect(page.businesses).toHaveLength(1);
    expect(page.businesses[0].name).toBe(SAMPLE_PLACE.displayName.text);
    // One-shot — nothing left to chain to after the Facebook-discovery pass.
    expect(page.nextPageToken).toBeNull();
  });

  afterEach(() => {
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  it("runs each selected category as its own full search rather than one combined query", async () => {
    // Places' :searchText is a relevance ranker, not a boolean query engine —
    // "Restaurants or Bakeries near X" was found in practice to just return
    // whichever category ranked higher, dropping the other entirely. Each
    // category must get its own :searchText call.
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ places: [] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGooglePlacesProvider();
    const criteria: AreaCodeCriteria = {
      searchType: "area_code",
      areaCode: "865",
      city: "Knoxville",
      state: "TN",
      category: "Restaurants, Bakeries",
      maxResults: 100,
    };

    // Page 1: :searchText for "Restaurants" runs out immediately (no
    // nextPageToken) -> FACEBOOK_SEARCH_FALLBACK for category 1.
    const page1 = await provider.searchBusinesses(criteria, {});
    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body1.textQuery).toBe("Restaurants in Knoxville, TN");
    expect(page1.nextPageToken).toBe("__facebook_search_fallback__");
    expect(page1.cursorPatch).toEqual({
      categoryQueue: ["Restaurants", "Bakeries"],
      categoryIndex: 0,
    });

    // Page 2: the one-shot Facebook-discovery pass for "Restaurants" (no
    // BRAVE_SEARCH_API_KEY configured, so it finds nothing) -> category 1's
    // chain is exhausted, advance to category 2.
    const page2 = await provider.searchBusinesses(criteria, {
      pageToken: page1.nextPageToken,
      ...page1.cursorPatch,
    });
    expect(page2.nextPageToken).toBe("__category_advance__");
    expect(page2.cursorPatch).toEqual({
      categoryQueue: ["Restaurants", "Bakeries"],
      categoryIndex: 1,
    });

    // Page 3: category 2's chain restarts from :searchText for "Bakeries".
    const page3 = await provider.searchBusinesses(criteria, {
      pageToken: page2.nextPageToken,
      ...page2.cursorPatch,
    });
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const body3 = JSON.parse(lastCall[1].body);
    expect(body3.textQuery).toBe("Bakeries in Knoxville, TN");
    expect(page3.cursorPatch).toEqual({
      categoryQueue: ["Restaurants", "Bakeries"],
      categoryIndex: 1,
    });
  });

  it("throws ProviderAuthError on a 401/403 response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    const provider = createGooglePlacesProvider();
    const criteria: ZipRadiusCriteria = {
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 10,
      category: "Restaurants",
      maxResults: 100,
    };
    await expect(provider.searchBusinesses(criteria, {})).rejects.toThrow(
      /rejected its credentials/,
    );
  });

  describe("findPublicEmail", () => {
    const originalBraveKey = process.env.BRAVE_SEARCH_API_KEY;
    const noWebsiteBusiness = mapPlaceToRawBusiness(
      { ...SAMPLE_PLACE, websiteUri: undefined },
      "Restaurants",
    );

    afterEach(() => {
      if (originalBraveKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
      else process.env.BRAVE_SEARCH_API_KEY = originalBraveKey;
    });

    it("reports not_found without ever calling Brave when the business has its own website", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.BRAVE_SEARCH_API_KEY = "brave-key";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const provider = createGooglePlacesProvider();
      const business = mapPlaceToRawBusiness(SAMPLE_PLACE, "Restaurants"); // has websiteUri
      const result = await provider.findPublicEmail(business);

      expect(result).toEqual({ email: null, status: "not_found", source: "email_domain" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports not_found when Brave isn't configured, for a no-website business", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      delete process.env.BRAVE_SEARCH_API_KEY;
      vi.stubGlobal("fetch", vi.fn());

      const provider = createGooglePlacesProvider();
      const result = await provider.findPublicEmail(noWebsiteBusiness);
      expect(result).toEqual({ email: null, status: "not_found", source: "email_domain" });
    });

    it("falls back to a Brave web search for a no-website business and reports what it finds", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.BRAVE_SEARCH_API_KEY = "brave-key";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                web: {
                  results: [
                    {
                      title: "Rosalita's Taqueria - Yelp",
                      url: "https://yelp.com/biz/rosalitas",
                      description: "Contact: hello@rosalitastaqueria.com",
                    },
                  ],
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
          ),
        ),
      );

      const provider = createGooglePlacesProvider();
      const result = await provider.findPublicEmail(noWebsiteBusiness);
      expect(result).toEqual({
        email: "hello@rosalitastaqueria.com",
        status: "publicly_listed",
        source: "search_name",
      });
    });
  });

  describe("findFacebookPage", () => {
    const originalBraveKey = process.env.BRAVE_SEARCH_API_KEY;
    const noWebsiteBusiness = mapPlaceToRawBusiness(
      { ...SAMPLE_PLACE, websiteUri: undefined },
      "Restaurants",
    );

    afterEach(() => {
      if (originalBraveKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
      else process.env.BRAVE_SEARCH_API_KEY = originalBraveKey;
    });

    it("trusts Places' own websiteUri when it already points at facebook.com, without calling Brave", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.BRAVE_SEARCH_API_KEY = "brave-key";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const provider = createGooglePlacesProvider();
      const business = mapPlaceToRawBusiness(
        { ...SAMPLE_PLACE, websiteUri: "https://facebook.com/RosalitasTaqueria" },
        "Restaurants",
      );
      const result = await provider.findFacebookPage(business);

      expect(result).toEqual({
        url: "https://facebook.com/RosalitasTaqueria",
        source: "provider",
        profileListsWebsite: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never checks Brave when the business already has a real independent website", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.BRAVE_SEARCH_API_KEY = "brave-key";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const provider = createGooglePlacesProvider();
      const business = mapPlaceToRawBusiness(SAMPLE_PLACE, "Restaurants"); // real websiteUri
      const result = await provider.findFacebookPage(business);

      expect(result).toEqual({ url: null, source: "provider", profileListsWebsite: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to a Brave web search for a no-website business and reports a confirmed Facebook page", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      process.env.BRAVE_SEARCH_API_KEY = "brave-key";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              web: {
                results: [
                  {
                    title: "Rosalita's Taqueria | Facebook",
                    url: "https://www.facebook.com/rosalitastaqueria",
                    description: "Rosalita's Taqueria, Knoxville, TN.",
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      );

      const provider = createGooglePlacesProvider();
      const result = await provider.findFacebookPage(noWebsiteBusiness);
      expect(result).toEqual({
        url: "https://www.facebook.com/rosalitastaqueria",
        source: "search_name",
        profileListsWebsite: null,
      });
    });

    it("reports no confirmed page when Brave isn't configured, for a no-website business", async () => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      delete process.env.BRAVE_SEARCH_API_KEY;
      vi.stubGlobal("fetch", vi.fn());

      const provider = createGooglePlacesProvider();
      const result = await provider.findFacebookPage(noWebsiteBusiness);
      expect(result).toEqual({ url: null, source: "provider", profileListsWebsite: null });
    });
  });
});
