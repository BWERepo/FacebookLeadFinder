/**
 * XLSX workbook building for the leads export — server-only (exceljs is a
 * Node-oriented library; the Worker's `nodejs_compat` flag is what lets it
 * run here at all). CSV export stays in the pure export.ts so its column
 * mapping is unit-testable without exceljs; this file only turns that same
 * mapping into a workbook buffer.
 *
 * Per the standing rule in export-sanitize.ts: text cells get the apostrophe
 * guard, hyperlink cells get URL-validated instead (and are never
 * apostrophe-prefixed, which would corrupt the visible link text).
 */

import ExcelJS from "exceljs";

import { isSafeExternalUrl, sanitizeCellText } from "@/lib/export-sanitize";
import { EXPORT_COLUMNS, exportHeaders, exportRowValues, type ExportableLead } from "@/lib/export";

/** Columns whose value should be written as a hyperlink when it's a safe URL. */
const HYPERLINK_COLUMN_KEYS = new Set(["facebook_url", "potential_website_url"]);

export async function buildLeadsWorkbookBuffer(leads: readonly ExportableLead[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");

  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).values = exportHeaders();
  sheet.getRow(1).font = { bold: true };

  for (const lead of leads) {
    const values = exportRowValues(lead);
    const row = sheet.addRow(values);

    EXPORT_COLUMNS.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      const raw = values[index];

      if (HYPERLINK_COLUMN_KEYS.has(column.key) && typeof raw === "string" && raw.length > 0) {
        if (isSafeExternalUrl(raw)) {
          cell.value = { text: raw, hyperlink: raw };
          return;
        }
        // Not a safe scheme — fall through to a plain, guarded text cell
        // rather than a clickable link to something like a `javascript:` URI.
      }

      if (typeof raw === "string") {
        cell.value = sanitizeCellText(raw);
      }
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
