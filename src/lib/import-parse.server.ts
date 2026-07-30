/**
 * Phase 10 — turning an uploaded CSV/XLSX file into headers + rows.
 *
 * Server-only: exceljs is a Node-oriented library (see export.server.ts for
 * the same reasoning), and running the parse server-side means the client
 * never has to bundle either parser — it just uploads bytes.
 *
 * Rows are capped at MAX_IMPORT_ROWS. This is a prospecting tool's bulk
 * import, not a data warehouse load; a file bigger than that is almost always
 * a wrong-file mistake, and silently truncating (with `truncated: true`
 * reported back) is safer than a request that times out the Worker.
 */

import Papa from "papaparse";
import ExcelJS from "exceljs";

export const MAX_IMPORT_ROWS = 2000;

export type ParsedFile = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
};

export function parseCsvFile(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const [headerRow, ...dataRows] = result.data;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());
  const totalRows = dataRows.length;
  const rows = dataRows
    .slice(0, MAX_IMPORT_ROWS)
    .map((row) => headers.map((_, i) => String(row[i] ?? "").trim()));
  return { headers, rows, totalRows, truncated: totalRows > MAX_IMPORT_ROWS };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== undefined) return String(value.result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return "";
  }
  return String(value).trim();
}

export async function parseXlsxFile(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [], totalRows: 0, truncated: false };

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellText(cell.value).trim();
  });

  const dataRows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const isBlank = headers.every((_, i) => cellText(row.getCell(i + 1).value) === "");
    if (isBlank) continue;
    dataRows.push(headers.map((_, i) => cellText(row.getCell(i + 1).value)));
  }

  const totalRows = dataRows.length;
  return {
    headers,
    rows: dataRows.slice(0, MAX_IMPORT_ROWS),
    totalRows,
    truncated: totalRows > MAX_IMPORT_ROWS,
  };
}

export async function parseImportFile(
  fileType: "csv" | "xlsx",
  buffer: Buffer,
): Promise<ParsedFile> {
  return fileType === "csv" ? parseCsvFile(buffer.toString("utf-8")) : parseXlsxFile(buffer);
}
