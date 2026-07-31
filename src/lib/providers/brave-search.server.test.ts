import { afterEach, describe, expect, it, vi } from "vitest";

import {
  braveWebSearch,
  findEmailViaWebSearch,
  isBraveSearchConfigured,
} from "./brave-search.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

describe("isBraveSearchConfigured", () => {
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = originalKey;
  });

  it("is false with no key set", () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    expect(isBraveSearchConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    expect(isBraveSearchConfigured()).toBe(true);
  });
});

describe("braveWebSearch", () => {
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("returns an empty array with no key configured, without calling fetch", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await braveWebSearch("anything");
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the subscription token header and query param", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ web: { results: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await braveWebSearch('"Joe\'s Plumbing" Knoxville, TN email');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(parsed.searchParams.get("q")).toBe('"Joe\'s Plumbing" Knoxville, TN email');
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Subscription-Token"]).toBe("test-key");
  });

  it("parses results out of the response shape", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          web: {
            results: [
              {
                title: "Joe's Plumbing - Yelp",
                url: "https://yelp.com/biz/joes",
                description: "Call us",
              },
            ],
          },
        }),
      ),
    );

    const results = await braveWebSearch("Joe's Plumbing");
    expect(results).toEqual([
      { title: "Joe's Plumbing - Yelp", url: "https://yelp.com/biz/joes", description: "Call us" },
    ]);
  });

  it("returns an empty array on a non-2xx response", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    expect(await braveWebSearch("anything")).toEqual([]);
  });
});

describe("findEmailViaWebSearch", () => {
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;
  const business = { name: "Joe's Plumbing", city: "Knoxville", state: "TN" };

  afterEach(() => {
    if (originalKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("returns null with no key configured", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    expect(await findEmailViaWebSearch(business)).toBeNull();
  });

  it("finds an email straight from a result's search snippet, without fetching the page", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        web: {
          results: [
            {
              title: "Joe's Plumbing",
              url: "https://yelp.com/biz/joes-plumbing",
              description: "Contact: joe@joesplumbing.com or call today.",
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const email = await findEmailViaWebSearch(business);
    expect(email).toBe("joe@joesplumbing.com");
    // Only the search call — never fetched the result page itself.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to fetching a result page when no snippet has an email", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          web: {
            results: [
              {
                title: "Joe's Plumbing - Yelp",
                url: "https://yelp.com/biz/joes-plumbing",
                description: "5-star rated plumber in Knoxville.",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(htmlResponse(`<a href="mailto:joe@joesplumbing.com">Email</a>`));
    vi.stubGlobal("fetch", fetchMock);

    const email = await findEmailViaWebSearch(business);
    expect(email).toBe("joe@joesplumbing.com");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when nothing turns up anywhere", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            web: {
              results: [
                {
                  title: "Joe's Plumbing",
                  url: "https://yelp.com/biz/joes",
                  description: "5 stars",
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(htmlResponse(`<p>No contact info.</p>`)),
    );

    expect(await findEmailViaWebSearch(business)).toBeNull();
  });

  it("never guesses an address from the business name or a domain", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ web: { results: [] } })));
    // No results at all — a naive implementation might be tempted to build
    // "joesplumbing@joesplumbing.com" from the business name. This must not happen.
    expect(await findEmailViaWebSearch(business)).toBeNull();
  });
});
