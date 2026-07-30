import { describe, expect, it } from "vitest";

import { listProviders, resolveProvider } from "./registry";

describe("listProviders", () => {
  it("lists all five providers named in the spec", () => {
    const names = listProviders().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["mock", "google_places", "bing", "brave", "serpapi"]),
    );
  });

  it("mock is always available", () => {
    const mock = listProviders().find((p) => p.name === "mock")!;
    expect(mock.available).toBe(true);
    expect(mock.reason).toBeNull();
  });

  it("every unavailable provider has a stated reason", () => {
    for (const provider of listProviders()) {
      if (!provider.available) {
        expect(provider.reason).toBeTruthy();
      }
    }
  });

  it("explains why Bing specifically is unavailable", () => {
    const bing = listProviders().find((p) => p.name === "bing")!;
    expect(bing.available).toBe(false);
    expect(bing.reason).toMatch(/retired/i);
  });
});

describe("resolveProvider", () => {
  it("returns the mock provider as-is", () => {
    const result = resolveProvider("mock");
    expect(result.actual).toBe("mock");
    expect(result.fallbackNote).toBeNull();
  });

  it("falls back to mock for an unimplemented provider, with a note", () => {
    const result = resolveProvider("google_places");
    expect(result.actual).toBe("mock");
    expect(result.fallbackNote).toMatch(/google_places/);
    expect(result.provider.name).toBe("mock");
  });

  it("falls back to mock for an unknown provider name", () => {
    const result = resolveProvider("carrier_pigeon");
    expect(result.actual).toBe("mock");
    expect(result.fallbackNote).toMatch(/unknown/i);
  });

  it("never throws, whatever is requested", () => {
    for (const name of ["mock", "google_places", "bing", "brave", "serpapi", "", "garbage"]) {
      expect(() => resolveProvider(name)).not.toThrow();
    }
  });

  it("the fallback provider is always actually usable", async () => {
    const result = resolveProvider("bing");
    expect(result.provider.available).toBe(true);
    // Prove it actually works, not just that it claims to.
    const page = await result.provider.searchBusinesses(
      { searchType: "zip_radius", zip: "37902", radiusMiles: 10, category: "", maxResults: 10 },
      {},
    );
    expect(page.businesses.length).toBeGreaterThan(0);
  });
});
