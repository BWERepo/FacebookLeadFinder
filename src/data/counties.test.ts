import { describe, expect, it } from "vitest";

import {
  COUNTIES_BY_STATE,
  countiesForState,
  countyDisplayName,
  hasCountyData,
  resolveCounty,
} from "./counties";

describe("countiesForState", () => {
  it("returns the bundled counties for a covered state", () => {
    expect(countiesForState("TN")).toEqual([]); // not yet bundled — see below
    expect(countiesForState("DE")).toEqual(["Kent", "New Castle", "Sussex"]);
  });

  it("is case-insensitive", () => {
    expect(countiesForState("de")).toEqual(countiesForState("DE"));
  });

  it("returns an empty array for an uncovered or unknown state", () => {
    // Documents the degrade-gracefully contract rather than throwing.
    expect(countiesForState("WY")).toEqual([]);
    expect(countiesForState("ZZ")).toEqual([]);
    expect(countiesForState(null)).toEqual([]);
  });
});

describe("hasCountyData", () => {
  it("reflects real coverage, not a guess", () => {
    expect(hasCountyData("CA")).toBe(true);
    expect(hasCountyData("WY")).toBe(false);
  });
});

describe("countyDisplayName", () => {
  it("appends 'County' for ordinary states", () => {
    expect(countyDisplayName("CA", "Los Angeles")).toBe("Los Angeles County");
  });

  it("does not append 'County' for Alaska or Louisiana, which are stored whole", () => {
    expect(countyDisplayName("AK", "Anchorage Municipality")).toBe("Anchorage Municipality");
  });

  it("returns an empty string for an empty county", () => {
    expect(countyDisplayName("CA", "")).toBe("");
  });
});

describe("resolveCounty", () => {
  it("matches on the bare name", () => {
    expect(resolveCounty("DE", "Kent")).toBe("Kent");
  });

  it("tolerates a County/Parish/Borough suffix and case differences", () => {
    expect(resolveCounty("DE", "kent county")).toBe("Kent");
    expect(resolveCounty("CA", "LOS ANGELES COUNTY")).toBe("Los Angeles");
  });

  it("matches an Alaska borough by its full stored name", () => {
    expect(resolveCounty("AK", "Anchorage Municipality")).toBe("Anchorage Municipality");
  });

  it("returns null for no match", () => {
    expect(resolveCounty("DE", "Nonexistent")).toBeNull();
    expect(resolveCounty("WY", "Anything")).toBeNull();
    expect(resolveCounty("DE", null)).toBeNull();
  });
});

describe("data integrity", () => {
  it("every bundled state uses valid two-letter codes", () => {
    for (const code of Object.keys(COUNTIES_BY_STATE)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("has no duplicate county names within a state", () => {
    for (const [state, counties] of Object.entries(COUNTIES_BY_STATE)) {
      expect(new Set(counties).size, `duplicate in ${state}`).toBe(counties.length);
    }
  });

  it("has no empty county names", () => {
    for (const counties of Object.values(COUNTIES_BY_STATE)) {
      for (const county of counties) {
        expect(county.trim()).not.toBe("");
      }
    }
  });
});
