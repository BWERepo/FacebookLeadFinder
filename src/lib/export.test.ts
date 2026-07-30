import { describe, expect, it } from "vitest";

import {
  EXPORT_COLUMNS,
  buildLeadsCsv,
  exportHeaders,
  exportRowValues,
  type ExportableLead,
} from "@/lib/export";

const BASE_LEAD: ExportableLead = {
  business_name: "Bergstrom Hydronics",
  category: "HVAC companies",
  phone: "(865) 555-0142",
  email: "info@bergstromhydronics.com",
  facebook_url: "https://facebook.com/BergstromHydronics",
  potential_website_url: null,
  address: "412 Depot Ave",
  city: "Knoxville",
  county: "Knox",
  state: "TN",
  zip: "37902",
  website_status: "facebook_only",
  qualified: true,
  confidence_score: 82,
  lead_status: "new",
  last_contact_date: null,
  next_followup_date: "2026-08-01",
  opportunity_score: 70,
  estimated_value_cents: 250000,
  first_found_at: "2026-07-01T12:00:00.000Z",
  last_checked_at: "2026-07-15T09:30:00.000Z",
};

describe("exportRowValues", () => {
  it("has one value per column, in EXPORT_COLUMNS order", () => {
    const values = exportRowValues(BASE_LEAD);
    expect(values).toHaveLength(EXPORT_COLUMNS.length);
    expect(values[0]).toBe("Bergstrom Hydronics");
  });

  it("renders qualified as Yes/No, not a boolean", () => {
    expect(exportRowValues(BASE_LEAD)[12]).toBe("Yes");
    expect(exportRowValues({ ...BASE_LEAD, qualified: false })[12]).toBe("No");
  });

  it("renders estimated value as a formatted dollar amount, and blank when null", () => {
    expect(exportRowValues(BASE_LEAD)[18]).toBe("$2,500.00");
    expect(exportRowValues({ ...BASE_LEAD, estimated_value_cents: null })[18]).toBe("");
  });

  it("renders null optional fields as empty strings, not 'null'", () => {
    const values = exportRowValues(BASE_LEAD);
    expect(values[3]).not.toContain("null");
    expect(exportRowValues({ ...BASE_LEAD, email: null })[3]).toBe("");
  });
});

describe("buildLeadsCsv", () => {
  it("starts with a UTF-8 BOM", () => {
    const csv = buildLeadsCsv([BASE_LEAD]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("has one header line, then one line per lead", () => {
    const csv = buildLeadsCsv([BASE_LEAD, BASE_LEAD]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Business Name");
  });

  it("neutralizes a formula-triggering business name", () => {
    const csv = buildLeadsCsv([{ ...BASE_LEAD, business_name: "=cmd|'/c calc'!A1" }]);
    // The apostrophe guard must be present right after the opening quote.
    const dataLine = csv.slice(1).split("\r\n")[1];
    expect(dataLine.startsWith(`"'=cmd`)).toBe(true);
  });
});

describe("exportHeaders", () => {
  it("returns one sanitized header per column", () => {
    expect(exportHeaders()).toHaveLength(EXPORT_COLUMNS.length);
    expect(exportHeaders()[0]).toBe("Business Name");
  });
});
