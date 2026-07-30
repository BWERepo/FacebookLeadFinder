import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS, parseCsvFile, parseXlsxFile } from "@/lib/import-parse.server";

describe("parseCsvFile", () => {
  it("splits headers from data rows", () => {
    const csv = "Name,Phone\nRosalita's Taqueria,865-555-0177\nShear Genius Salon,865-555-0193";
    const parsed = parseCsvFile(csv);
    expect(parsed.headers).toEqual(["Name", "Phone"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual(["Rosalita's Taqueria", "865-555-0177"]);
    expect(parsed.truncated).toBe(false);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'Name,Address\n"Acme, Inc.","123 Main St"';
    const parsed = parseCsvFile(csv);
    expect(parsed.rows[0]).toEqual(["Acme, Inc.", "123 Main St"]);
  });

  it("truncates and reports truncation past MAX_IMPORT_ROWS", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Business ${i}`).join("\n");
    const csv = `Name\n${rows}`;
    const parsed = parseCsvFile(csv);
    expect(parsed.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(parsed.totalRows).toBe(MAX_IMPORT_ROWS + 5);
    expect(parsed.truncated).toBe(true);
  });
});

describe("parseXlsxFile", () => {
  async function buildWorkbookBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Name", "Phone"]);
    sheet.addRow(["Rosalita's Taqueria", "865-555-0177"]);
    sheet.addRow(["Shear Genius Salon", "865-555-0193"]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it("parses a real workbook's headers and rows", async () => {
    const buffer = await buildWorkbookBuffer();
    const parsed = await parseXlsxFile(buffer);
    expect(parsed.headers).toEqual(["Name", "Phone"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual(["Rosalita's Taqueria", "865-555-0177"]);
  });

  it("skips fully blank rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Name"]);
    sheet.addRow(["Real Business"]);
    sheet.addRow([]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseXlsxFile(buffer);
    expect(parsed.rows).toHaveLength(1);
  });
});
