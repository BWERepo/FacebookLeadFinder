import { describe, expect, it } from "vitest";

import {
  haversineMiles,
  isKnownZip,
  isValidZip,
  milesToMeters,
  zipToCentroid,
  zipToCounty,
  zipToEntry,
  zipsForAreaCodeCities,
  zipsForCounty,
  zipsWithinRadius,
} from "./geo";

describe("zipToEntry / zipToCentroid / zipToCounty", () => {
  it("looks up a known ZIP", () => {
    const entry = zipToEntry("37902");
    expect(entry?.city).toBe("Knoxville");
    expect(entry?.state).toBe("TN");
  });

  it("returns a centroid for a known ZIP", () => {
    const centroid = zipToCentroid("37902");
    expect(centroid).toEqual({ lat: 35.9606, lng: -83.9207 });
  });

  it("returns the county for a known ZIP", () => {
    expect(zipToCounty("37902")).toBe("Knox");
  });

  it("returns null for an unknown ZIP", () => {
    expect(zipToEntry("00000")).toBeNull();
    expect(zipToCentroid("00000")).toBeNull();
    expect(zipToCounty("00000")).toBeNull();
  });
});

describe("isValidZip vs isKnownZip", () => {
  it("isValidZip only checks shape", () => {
    expect(isValidZip("37902")).toBe(true);
    // A syntactically valid ZIP the seed doesn't happen to cover.
    expect(isValidZip("00501")).toBe(true);
    expect(isValidZip("123")).toBe(false);
    expect(isValidZip("abcde")).toBe(false);
  });

  it("isKnownZip checks the bundled data", () => {
    expect(isKnownZip("37902")).toBe(true);
    expect(isKnownZip("00501")).toBe(false);
  });
});

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    const p = { lat: 35.9606, lng: -83.9207 };
    expect(haversineMiles(p, p)).toBeCloseTo(0, 5);
  });

  it("computes a plausible distance between two real cities", () => {
    // Knoxville, TN to Nashville, TN is roughly 160 miles as the crow flies.
    const knoxville = { lat: 35.9606, lng: -83.9207 };
    const nashville = { lat: 36.1662, lng: -86.7744 };
    const distance = haversineMiles(knoxville, nashville);
    expect(distance).toBeGreaterThan(150);
    expect(distance).toBeLessThan(170);
  });

  it("is symmetric", () => {
    const a = { lat: 35.9606, lng: -83.9207 };
    const b = { lat: 36.1662, lng: -86.7744 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 10);
  });
});

describe("milesToMeters", () => {
  it("converts correctly", () => {
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 3);
    expect(milesToMeters(10)).toBeCloseTo(16093.44, 2);
  });
});

describe("zipsWithinRadius", () => {
  it("includes the origin ZIP itself", () => {
    const results = zipsWithinRadius("37902", 5);
    expect(results.some((z) => z.zip === "37902")).toBe(true);
  });

  it("includes nearby ZIPs and excludes distant ones", () => {
    // 37909 and 37919 are both within a few miles of downtown Knoxville
    // (37902); Nashville (37201) is ~160 miles away.
    const results = zipsWithinRadius("37902", 15).map((z) => z.zip);
    expect(results).toContain("37909");
    expect(results).toContain("37919");
    expect(results).not.toContain("37201");
  });

  it("sorts nearest first", () => {
    const results = zipsWithinRadius("37902", 200);
    const distances = results.map((z) => haversineMiles({ lat: 35.9606, lng: -83.9207 }, z));
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it("returns an empty array for an unknown origin ZIP", () => {
    expect(zipsWithinRadius("00000", 10)).toEqual([]);
  });

  it("returns an empty array for a zero-mile radius elsewhere", () => {
    // Nothing else is exactly co-located with 37902 in the seed data.
    const results = zipsWithinRadius("37902", 0);
    expect(results.every((z) => z.zip === "37902")).toBe(true);
  });
});

describe("zipsForCounty", () => {
  it("returns every ZIP in a county", () => {
    const results = zipsForCounty("TN", "Knox");
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((z) => z.county === "Knox" && z.state === "TN")).toBe(true);
  });

  it("is case-insensitive on the county name", () => {
    expect(zipsForCounty("TN", "knox")).toEqual(zipsForCounty("TN", "Knox"));
  });

  it("returns an empty array for a county with no seed coverage", () => {
    expect(zipsForCounty("WY", "Teton")).toEqual([]);
  });
});

describe("zipsForAreaCodeCities", () => {
  it("returns ZIPs for the listed cities", () => {
    const results = zipsForAreaCodeCities("865", ["Knoxville"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((z) => z.city === "Knoxville")).toBe(true);
  });

  it("returns an empty array when no listed city is in the seed", () => {
    expect(zipsForAreaCodeCities("999", ["Nowhereville"])).toEqual([]);
  });
});
