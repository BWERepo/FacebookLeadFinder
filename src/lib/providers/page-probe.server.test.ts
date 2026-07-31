import { afterEach, describe, expect, it, vi } from "vitest";

import { extractEmailFromHtml, probePage } from "./page-probe.server";

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

  describe("extractEmailFromHtml", () => {
    it("prefers a mailto: link over a bare address in the text", () => {
      const html = `<a href="mailto:owner@joesplumbing.com">Email us</a><p>or write info@other.com</p>`;
      expect(extractEmailFromHtml(html)).toBe("owner@joesplumbing.com");
    });

    it("finds a bare address in visible text when there's no mailto: link", () => {
      const html = `<body><p>Reach us at contact@bluebirdbakery.com any time.</p></body>`;
      expect(extractEmailFromHtml(html)).toBe("contact@bluebirdbakery.com");
    });

    it("decodes a URL-encoded mailto: target", () => {
      const html = `<a href="mailto:owner%40joesplumbing.com">Email</a>`;
      expect(extractEmailFromHtml(html)).toBe("owner@joesplumbing.com");
    });

    it("returns null when nothing is present", () => {
      const html = `<html><body><p>No contact info here.</p></body></html>`;
      expect(extractEmailFromHtml(html)).toBeNull();
    });

    it("filters out known non-business domains (trackers, placeholders)", () => {
      const html = `<p>noreply@sentry.io logged this. contact@example.com is a placeholder.</p>`;
      expect(extractEmailFromHtml(html)).toBeNull();
    });

    it("filters out a hex-hash local part (generated asset/tracking noise)", () => {
      const html = `<p>a1b2c3d4e5f6a7b8@wixpress.com and 0123456789abcdef0123@realdomain.com</p>`;
      // wixpress.com is domain-blocked; the hex-hash local part at realdomain.com
      // should also be rejected even though the domain itself isn't blocklisted.
      expect(extractEmailFromHtml(html)).toBeNull();
    });

    it("works on a plain-text snippet with no HTML markup at all", () => {
      expect(extractEmailFromHtml("Contact Jane at jane@acmeplumbing.com for a quote.")).toBe(
        "jane@acmeplumbing.com",
      );
    });
  });

  describe("SSRF guard", () => {
    it("never fetches a loopback URL, even if a provider hands one to it", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await probePage("google_places", "http://127.0.0.1:8080/admin");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.reachable).toBe(false);
    });

    it("never fetches localhost", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await probePage("google_places", "http://localhost/internal");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.reachable).toBe(false);
    });

    it("never fetches a non-http(s) scheme", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await probePage("google_places", "file:///etc/passwd");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.reachable).toBe(false);
    });

    it("never fetches a bare IP literal (a common SSRF/metadata-endpoint shape)", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const result = await probePage("google_places", "http://169.254.169.254/latest/meta-data/");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.reachable).toBe(false);
    });
  });
});
