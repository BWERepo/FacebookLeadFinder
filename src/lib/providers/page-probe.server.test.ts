import { afterEach, describe, expect, it, vi } from "vitest";

import { probePage } from "./page-probe.server";

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

describe("probePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts the title and visible text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse(`<html><head><title>Joe's Plumbing</title></head>
          <body><script>track();</script><h1>Joe's Plumbing</h1><p>Call (865) 555-0142</p></body></html>`),
      ),
    );

    const result = await probePage("google_places", "https://joesplumbing.com");
    expect(result.reachable).toBe(true);
    expect(result.pageTitle).toBe("Joe's Plumbing");
    expect(result.pageText).toContain("Call (865) 555-0142");
    expect(result.pageText).not.toContain("track()");
  });

  it("decodes common HTML entities in the title and text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          htmlResponse(
            `<html><head><title>Joe &amp; Sons</title></head><body>Fish &amp; Chips</body></html>`,
          ),
        ),
    );
    const result = await probePage("google_places", "https://example.com");
    expect(result.pageTitle).toBe("Joe & Sons");
    expect(result.pageText).toContain("Fish & Chips");
  });

  it("reports unreachable for a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const result = await probePage("google_places", "https://example.com/gone");
    expect(result.reachable).toBe(false);
    expect(result.pageText).toBeNull();
  });

  it("reports unreachable on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await probePage("google_places", "https://unreachable.example");
    expect(result.reachable).toBe(false);
    expect(result.pageTitle).toBeNull();
    expect(result.pageText).toBeNull();
  });

  it("does not attempt to extract text from a non-HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
        ),
    );
    const result = await probePage("google_places", "https://example.com/api");
    expect(result.reachable).toBe(true);
    expect(result.pageText).toBeNull();
  });

  it("truncates very long pages", async () => {
    const huge = "a ".repeat(50_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse(`<html><body>${huge}</body></html>`)),
    );
    const result = await probePage("google_places", "https://example.com/huge");
    expect(result.pageText!.length).toBeLessThanOrEqual(20_000);
  });

  it("returns null for an empty or missing title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse(`<html><head></head><body>hi</body></html>`)),
    );
    const result = await probePage("google_places", "https://example.com/no-title");
    expect(result.pageTitle).toBeNull();
  });
});
