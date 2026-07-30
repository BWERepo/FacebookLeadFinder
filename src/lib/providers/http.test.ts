import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderRateLimited } from "./types";
import { fetchWithBackoff, TokenBucket } from "./http";

describe("fetchWithBackoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns immediately on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithBackoff("google_places", "https://example.com", {});
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a plain 4xx error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithBackoff("google_places", "https://example.com", {});
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithBackoff(
      "google_places",
      "https://example.com",
      {},
      { baseDelayMs: 1 },
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithBackoff(
      "google_places",
      "https://example.com",
      {},
      { baseDelayMs: 1 },
    );
    expect(response.status).toBe(200);
  });

  it("throws ProviderRateLimited after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithBackoff(
        "google_places",
        "https://example.com",
        {},
        { maxRetries: 2, baseDelayMs: 1 },
      ),
    ).rejects.toThrow(ProviderRateLimited);
    // Initial attempt + 2 retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honours a Retry-After header on the thrown error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("rate limited", { status: 429, headers: { "Retry-After": "7" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await fetchWithBackoff(
        "google_places",
        "https://example.com",
        {},
        { maxRetries: 0, baseDelayMs: 1 },
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRateLimited);
      expect((error as ProviderRateLimited).retryAfterMs).toBe(7000);
    }
  });
});

describe("TokenBucket", () => {
  it("allows immediate takes up to capacity", async () => {
    const bucket = new TokenBucket(1000, 3); // high rate, small capacity, fast test
    const start = Date.now();
    await bucket.take();
    await bucket.take();
    await bucket.take();
    // All three should have been immediate — capacity covers them.
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("refills over time", async () => {
    const bucket = new TokenBucket(1000, 1); // 1000/sec => refills a token in ~1ms
    await bucket.take();
    await new Promise((r) => setTimeout(r, 5));
    const start = Date.now();
    await bucket.take();
    // Should not have had to wait long, since the bucket refilled.
    expect(Date.now() - start).toBeLessThan(20);
  });
});
