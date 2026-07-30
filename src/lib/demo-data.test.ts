import { describe, expect, it } from "vitest";

import { DEMO_BUSINESSES, buildDemoLeadRow, buildDemoLeadRows } from "@/lib/demo-data";
import { isQualifyingStatus } from "@/lib/domain";

const CREATED_BY = "00000000-0000-0000-0000-000000000000";

describe("demo-data", () => {
  it("has at least 25 fictional businesses", () => {
    expect(DEMO_BUSINESSES.length).toBeGreaterThanOrEqual(25);
  });

  it("produces at least 25 insertable rows, excluding the duplicate_pair fixture", () => {
    const rows = buildDemoLeadRows(CREATED_BY);
    expect(rows.length).toBeGreaterThanOrEqual(25);
    expect(rows.length).toBe(DEMO_BUSINESSES.length - 1);
  });

  it("never produces two rows with the same normalized Facebook URL", () => {
    const rows = buildDemoLeadRows(CREATED_BY);
    const urls = rows.map((r) => r.normalized_facebook_url).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("never produces two rows with the same provider_place_id", () => {
    const rows = buildDemoLeadRows(CREATED_BY);
    const ids = rows.map((r) => r.provider_place_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every row satisfies the qualified-requires-evidence rule", () => {
    const rows = buildDemoLeadRows(CREATED_BY);
    for (const row of rows) {
      if (row.qualified) {
        expect(isQualifyingStatus(row.website_status as never)).toBe(true);
        expect(row.normalized_facebook_url).toBeTruthy();
      }
    }
  });

  it("every row has a confidence score between 0 and 100 and is_demo true", () => {
    const rows = buildDemoLeadRows(CREATED_BY);
    for (const row of rows) {
      expect(row.confidence_score as number).toBeGreaterThanOrEqual(0);
      expect(row.confidence_score as number).toBeLessThanOrEqual(100);
      expect(row.is_demo).toBe(true);
      expect(row.created_by).toBe(CREATED_BY);
    }
  });

  it("is deterministic — building the same business twice yields the same row", () => {
    const business = DEMO_BUSINESSES[0];
    const a = buildDemoLeadRow(business, CREATED_BY);
    const b = buildDemoLeadRow(business, CREATED_BY);
    const { last_checked_at: _a, ...restA } = a;
    const { last_checked_at: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });
});
