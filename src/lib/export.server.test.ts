import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildLeadsWorkbookBuffer } from "@/lib/export.server";
import { EXPORT_COLUMNS, type ExportableLead } from "@/lib/export";

const LEAD: ExportableLead = {
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
  next_followup_date: null,
  opportunity_score: null,
  estimated_value_cents: null,
  first_found_at: "2026-07-01T12:00:00.000Z",
  last_checked_at: null,
};

describe("buildLeadsWorkbookBuffer", () => {
  it("produces a buffer that reloads as a valid workbook with a header + one row", async () => {
    const buffer = await buildLeadsWorkbookBuffer([LEAD]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Leads");
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(2);
    expect(sheet!.getRow(1).getCell(1).value).toBe(EXPORT_COLUMNS[0].header);
    expect(sheet!.getRow(2).getCell(1).value).toBe("Bergstrom Hydronics");
  });

  it("writes the Facebook URL as a real hyperlink", async () => {
    const buffer = await buildLeadsWorkbookBuffer([LEAD]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Leads")!;
    const cell = sheet.getRow(2).getCell(5); // facebook_url is the 5th column
    const value = cell.value as { hyperlink?: string; text?: string };
    expect(value.hyperlink).toBe(LEAD.facebook_url);
  });

  it("styles the hyperlink cell so it visually reads as a link, not plain text", async () => {
    const buffer = await buildLeadsWorkbookBuffer([LEAD]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Leads")!;
    const cell = sheet.getRow(2).getCell(5);
    expect(cell.font?.underline).toBe(true);
    expect(cell.font?.color?.argb).toBe("FF0563C1");
  });

  it("neutralizes a formula-triggering business name instead of writing a formula", async () => {
    const buffer = await buildLeadsWorkbookBuffer([{ ...LEAD, business_name: "=1+1" }]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Leads")!;
    const cell = sheet.getRow(2).getCell(1);
    // A real formula cell's .value would be an object like { formula: "1+1" }.
    expect(typeof cell.value).toBe("string");
    expect(cell.value).toBe("'=1+1");
  });

  it("never writes a hyperlink for an unsafe URL scheme", async () => {
    const buffer = await buildLeadsWorkbookBuffer([
      { ...LEAD, facebook_url: "javascript:alert(1)" },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Leads")!;
    const cell = sheet.getRow(2).getCell(5);
    expect(typeof cell.value).toBe("string");
  });
});
