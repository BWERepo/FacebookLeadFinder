import { describe, expect, it } from "vitest";

import { AREA_CODES, areaCodeInfo, areaCodesForState, isValidAreaCode } from "./area-codes";

describe("data integrity", () => {
  it("every code is a valid NANP three-digit prefix", () => {
    for (const entry of AREA_CODES) {
      expect(entry.code).toMatch(/^[2-9][0-9]{2}$/);
    }
  });

  it("has no duplicate codes", () => {
    const codes = AREA_CODES.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has at least one state and one city", () => {
    for (const entry of AREA_CODES) {
      expect(entry.states.length).toBeGreaterThan(0);
      expect(entry.cities.length).toBeGreaterThan(0);
    }
  });
});

describe("areaCodeInfo", () => {
  it("returns a known code", () => {
    expect(areaCodeInfo("865")).toEqual({
      code: "865",
      states: ["TN"],
      cities: ["Knoxville"],
    });
  });

  it("returns null for an unknown or malformed code", () => {
    expect(areaCodeInfo("000")).toBeNull();
    expect(areaCodeInfo("abc")).toBeNull();
    expect(areaCodeInfo(null)).toBeNull();
  });
});

describe("isValidAreaCode", () => {
  it("accepts a real code", () => {
    expect(isValidAreaCode("865")).toBe(true);
  });

  it("rejects a code that is shaped right but not real", () => {
    expect(isValidAreaCode("000")).toBe(false);
    expect(isValidAreaCode("199")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidAreaCode("86")).toBe(false);
    expect(isValidAreaCode("8655")).toBe(false);
    expect(isValidAreaCode("abc")).toBe(false);
  });
});

describe("areaCodesForState", () => {
  it("returns every code for a state", () => {
    const tn = areaCodesForState("TN");
    expect(tn).toContain("865");
    expect(tn).toContain("615");
    expect(tn).toContain("901");
  });

  it("is case-insensitive", () => {
    expect(areaCodesForState("tn")).toEqual(areaCodesForState("TN"));
  });

  it("returns an empty array for an unknown state", () => {
    expect(areaCodesForState("ZZ")).toEqual([]);
  });
});
