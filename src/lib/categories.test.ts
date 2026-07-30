import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CATEGORY_PRESETS,
  categoryLabel,
  isPresetCategory,
  resolveCategory,
  slugifyCategory,
} from "./categories";

describe("presets match the seed migration", () => {
  const sql = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "supabase",
      "migrations",
      "20260801001000_seed_reference_data.sql",
    ),
    "utf8",
  );
  const section = sql.slice(
    sql.indexOf("INSERT INTO public.business_categories"),
    sql.indexOf("INSERT INTO public.excluded_domains"),
  );
  const rows = [...section.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*(\d+),\s*true\)/g)].map((m) => ({
    slug: m[1],
    label: m[2],
    sortOrder: Number(m[3]),
  }));

  it("found rows to compare", () => {
    expect(rows).toHaveLength(18);
  });

  it("has the same slugs, labels and ordering", () => {
    expect(rows).toEqual(
      CATEGORY_PRESETS.map((c) => ({ slug: c.slug, label: c.label, sortOrder: c.sortOrder })),
    );
  });

  it("includes every category the spec names", () => {
    for (const slug of [
      "auto_repair",
      "restaurants",
      "contractors",
      "plumbers",
      "hvac",
      "electricians",
      "hair_salons",
      "barbers",
      "retail",
      "cleaning",
      "landscaping",
      "dentists",
      "real_estate",
      "photographers",
      "bakeries",
      "craft",
      "home_services",
      "other",
    ]) {
      expect(isPresetCategory(slug)).toBe(true);
    }
  });
});

describe("slugifyCategory", () => {
  it("turns free text into a valid slug", () => {
    expect(slugifyCategory("Pool Cleaning")).toBe("pool_cleaning");
    expect(slugifyCategory("Pet  Grooming!")).toBe("pet_grooming");
    expect(slugifyCategory("  Tattoo Studio  ")).toBe("tattoo_studio");
  });

  it("produces slugs that satisfy the database CHECK constraint", () => {
    const pattern = /^[a-z0-9]+(_[a-z0-9]+)*$/;
    for (const input of ["Pool Cleaning", "24/7 Towing", "Bob's Bait & Tackle", "HVAC"]) {
      const slug = slugifyCategory(input)!;
      expect(slug).toMatch(pattern);
    }
  });

  it("returns null when nothing usable remains", () => {
    expect(slugifyCategory("!!!")).toBeNull();
    expect(slugifyCategory("")).toBeNull();
    expect(slugifyCategory("   ")).toBeNull();
    expect(slugifyCategory(null)).toBeNull();
  });

  it("caps the length", () => {
    expect(slugifyCategory("a".repeat(200))!.length).toBeLessThanOrEqual(60);
  });
});

describe("resolveCategory", () => {
  it("accepts a preset slug", () => {
    expect(resolveCategory("auto_repair")).toEqual({
      slug: "auto_repair",
      label: "Auto repair",
    });
  });

  it("accepts a preset label, case-insensitively", () => {
    expect(resolveCategory("Auto repair").slug).toBe("auto_repair");
    expect(resolveCategory("AUTO REPAIR").slug).toBe("auto_repair");
  });

  it("accepts free text as a custom category", () => {
    expect(resolveCategory("Pool Cleaning")).toEqual({
      slug: "pool_cleaning",
      label: "Pool Cleaning",
    });
  });

  it("puts differently-cased custom text in the same bucket", () => {
    // Otherwise the dashboard chart shows "Pool Cleaning" and "pool cleaning"
    // as two separate categories.
    expect(resolveCategory("Pool Cleaning").slug).toBe(resolveCategory("pool cleaning").slug);
  });

  it("falls back to 'other' for empty or unusable input", () => {
    expect(resolveCategory("").slug).toBe("other");
    expect(resolveCategory("   ").slug).toBe("other");
    expect(resolveCategory("###").slug).toBe("other");
    expect(resolveCategory(null).slug).toBe("other");
  });
});

describe("categoryLabel", () => {
  it("returns the preset label", () => {
    expect(categoryLabel("hvac")).toBe("HVAC companies");
  });

  it("returns a custom category's label", () => {
    expect(
      categoryLabel("pool_cleaning", [
        { slug: "pool_cleaning", label: "Pool Cleaning", sortOrder: 200 },
      ]),
    ).toBe("Pool Cleaning");
  });

  it("humanizes an unknown slug rather than showing it raw", () => {
    // Happens when a category row was deleted but leads still reference it.
    expect(categoryLabel("mobile_car_wash")).toBe("Mobile Car Wash");
  });

  it("handles a missing slug", () => {
    expect(categoryLabel(null)).toBe("Uncategorized");
    expect(categoryLabel("")).toBe("Uncategorized");
  });
});
