import { describe, expect, it } from "vitest";

import {
  applyMapping,
  autoMapColumns,
  buildImportLeadFields,
  rowToRecord,
  validateImportRow,
  type ColumnMapping,
  type RawImportFields,
} from "@/lib/import-mapping";

describe("autoMapColumns", () => {
  it("matches common header spellings to their target field", () => {
    const mapping = autoMapColumns(["Business Name", "Phone Number", "E-mail", "City", "State"]);
    expect(mapping.business_name).toBe("Business Name");
    expect(mapping.phone).toBe("Phone Number");
    expect(mapping.email).toBe("E-mail");
    expect(mapping.city).toBe("City");
    expect(mapping.state).toBe("State");
  });

  it("leaves a target field unmapped when no header matches", () => {
    const mapping = autoMapColumns(["Name"]);
    expect(mapping.zip).toBeUndefined();
  });
});

describe("rowToRecord + applyMapping", () => {
  const headers = ["Name", "Phone", "Email"];
  const mapping: ColumnMapping = { business_name: "Name", phone: "Phone", email: "Email" };

  it("applies the mapping to pull the right value for each target field", () => {
    const record = rowToRecord(headers, ["Rosalita's Taqueria", "865-555-0177", "hi@rosalita.com"]);
    const raw = applyMapping(record, mapping);
    expect(raw.business_name).toBe("Rosalita's Taqueria");
    expect(raw.phone).toBe("865-555-0177");
    expect(raw.email).toBe("hi@rosalita.com");
    expect(raw.city).toBe("");
  });

  it("trims whitespace from mapped values", () => {
    const record = rowToRecord(headers, ["  Padded Co  ", "", ""]);
    const raw = applyMapping(record, mapping);
    expect(raw.business_name).toBe("Padded Co");
  });

  it("leaves a field empty when its target isn't mapped at all", () => {
    const record = rowToRecord(headers, ["Name Only", "", ""]);
    const raw = applyMapping(record, { business_name: "Name" });
    expect(raw.phone).toBe("");
  });
});

const VALID_ROW: RawImportFields = {
  business_name: "Rosalita's Taqueria",
  phone: "865-555-0177",
  email: "hi@rosalita.com",
  facebook_url: "https://facebook.com/rosalita",
  website_url: "",
  address: "88 Market Sq",
  city: "Knoxville",
  county: "Knox",
  state: "TN",
  zip: "37902",
  category: "Restaurants",
};

describe("validateImportRow", () => {
  it("accepts a row with a business name and a valid email", () => {
    expect(validateImportRow(VALID_ROW)).toEqual({ valid: true });
  });

  it("rejects a row with no business name", () => {
    const result = validateImportRow({ ...VALID_ROW, business_name: "" });
    expect(result.valid).toBe(false);
  });

  it("rejects a row whose email is malformed", () => {
    const result = validateImportRow({ ...VALID_ROW, email: "not-an-email" });
    expect(result.valid).toBe(false);
  });

  it("accepts a row with no email at all — email is optional", () => {
    expect(validateImportRow({ ...VALID_ROW, email: "" })).toEqual({ valid: true });
  });
});

describe("buildImportLeadFields", () => {
  it("never claims website verification for an imported row", () => {
    const fields = buildImportLeadFields(VALID_ROW);
    expect(fields.website_status).toBe("needs_manual_review");
    expect(fields.qualified).toBe(false);
    expect(fields.confidence_band).toBe("manual");
  });

  it("normalizes phone, email, and Facebook URL the same way the search pipeline does", () => {
    const fields = buildImportLeadFields(VALID_ROW);
    expect(fields.normalized_phone).toBe("8655550177");
    expect(fields.normalized_email).toBe("hi@rosalita.com");
    expect(fields.normalized_facebook_url).toBeTruthy();
  });

  it("resolves a free-text category to a slug", () => {
    const fields = buildImportLeadFields(VALID_ROW);
    expect(fields.category_slug).toBe("restaurants");
  });

  it("stores no email/facebook URL as null, not an empty string", () => {
    const fields = buildImportLeadFields({ ...VALID_ROW, email: "", facebook_url: "" });
    expect(fields.email).toBeNull();
    expect(fields.facebook_url).toBeNull();
  });
});
