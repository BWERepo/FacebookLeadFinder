import { describe, expect, it } from "vitest";

import {
  areaCodeCriteriaSchema,
  describeCriteria,
  searchCriteriaSchema,
  stateCountyCriteriaSchema,
  zipRadiusCriteriaSchema,
} from "./search-criteria";

describe("zipRadiusCriteriaSchema", () => {
  it("accepts a valid ZIP + radius", () => {
    const result = zipRadiusCriteriaSchema.parse({
      searchType: "zip_radius",
      zip: "37902",
      radiusMiles: 15,
      category: "plumbers",
      maxResults: 50,
    });
    expect(result.zip).toBe("37902");
  });

  it("defaults radius, category and maxResults", () => {
    const result = zipRadiusCriteriaSchema.parse({ searchType: "zip_radius", zip: "37902" });
    expect(result.radiusMiles).toBe(10);
    expect(result.category).toBe("");
    expect(result.maxResults).toBe(100);
  });

  it("rejects a malformed ZIP", () => {
    expect(() => zipRadiusCriteriaSchema.parse({ searchType: "zip_radius", zip: "abc" })).toThrow();
    expect(() => zipRadiusCriteriaSchema.parse({ searchType: "zip_radius", zip: "123" })).toThrow();
  });

  it("rejects an out-of-range radius", () => {
    expect(() =>
      zipRadiusCriteriaSchema.parse({ searchType: "zip_radius", zip: "37902", radiusMiles: 0 }),
    ).toThrow();
    expect(() =>
      zipRadiusCriteriaSchema.parse({ searchType: "zip_radius", zip: "37902", radiusMiles: 500 }),
    ).toThrow();
  });
});

describe("areaCodeCriteriaSchema", () => {
  it("accepts a valid area code with optional city/state", () => {
    const result = areaCodeCriteriaSchema.parse({
      searchType: "area_code",
      areaCode: "865",
      city: "Knoxville",
      state: "tn",
    });
    expect(result.state).toBe("TN"); // uppercased
  });

  it("allows an empty state", () => {
    const result = areaCodeCriteriaSchema.parse({ searchType: "area_code", areaCode: "865" });
    expect(result.state).toBe("");
  });

  it("rejects an unknown state code", () => {
    expect(() =>
      areaCodeCriteriaSchema.parse({ searchType: "area_code", areaCode: "865", state: "ZZ" }),
    ).toThrow();
  });

  it("rejects a malformed area code", () => {
    expect(() =>
      areaCodeCriteriaSchema.parse({ searchType: "area_code", areaCode: "86" }),
    ).toThrow();
    expect(() =>
      areaCodeCriteriaSchema.parse({ searchType: "area_code", areaCode: "165" }),
    ).toThrow();
  });
});

describe("stateCountyCriteriaSchema", () => {
  it("accepts a valid state and county", () => {
    const result = stateCountyCriteriaSchema.parse({
      searchType: "state_county",
      state: "tn",
      county: "Knox",
    });
    expect(result.state).toBe("TN");
  });

  it("requires a county", () => {
    expect(() =>
      stateCountyCriteriaSchema.parse({ searchType: "state_county", state: "TN", county: "" }),
    ).toThrow();
  });

  it("rejects an unknown state", () => {
    expect(() =>
      stateCountyCriteriaSchema.parse({ searchType: "state_county", state: "ZZ", county: "Knox" }),
    ).toThrow();
  });
});

describe("searchCriteriaSchema (discriminated union)", () => {
  it("routes to the right schema based on searchType", () => {
    expect(searchCriteriaSchema.parse({ searchType: "zip_radius", zip: "37902" }).searchType).toBe(
      "zip_radius",
    );
    expect(
      searchCriteriaSchema.parse({ searchType: "area_code", areaCode: "865" }).searchType,
    ).toBe("area_code");
    expect(
      searchCriteriaSchema.parse({ searchType: "state_county", state: "TN", county: "Knox" })
        .searchType,
    ).toBe("state_county");
  });

  it("rejects an unrecognized searchType", () => {
    expect(() => searchCriteriaSchema.parse({ searchType: "carrier_pigeon" })).toThrow();
  });
});

describe("describeCriteria", () => {
  it("describes each mode", () => {
    expect(
      describeCriteria({
        searchType: "zip_radius",
        zip: "37902",
        radiusMiles: 10,
        category: "plumbers",
        maxResults: 100,
      }),
    ).toBe("37902 + 10 mi — plumbers");

    expect(
      describeCriteria({
        searchType: "area_code",
        areaCode: "865",
        city: "Knoxville",
        state: "TN",
        category: "",
        maxResults: 100,
      }),
    ).toBe("Area code 865 — Knoxville");

    expect(
      describeCriteria({
        searchType: "state_county",
        state: "TN",
        county: "Knox",
        city: "",
        category: "",
        maxResults: 100,
      }),
    ).toBe("Knox, TN");
  });
});
