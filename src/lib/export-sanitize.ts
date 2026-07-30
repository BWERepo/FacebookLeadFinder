/**
 * Spreadsheet-injection defence for CSV and XLSX exports. Pure.
 *
 * Lead data is third-party text scraped from public listings. A business whose
 * name is `=cmd|'/c calc'!A1` is not hypothetical — it's the standard way to
 * turn a data export into code execution on whoever opens it. Excel evaluates
 * any cell whose text begins with `=`, `+`, `-` or `@`, and the DDE syntax
 * above prompts the user to launch an external program.
 *
 * Two different guards, for two different reasons:
 *
 *   - **Text cells** get an apostrophe prefix, which Excel reads as "treat the
 *     rest as literal text" and does not display.
 *   - **Hyperlink cells** must NOT be prefixed — the apostrophe would corrupt
 *     the visible URL. They are guarded by URL validation instead, which is the
 *     real attack surface there (`javascript:`, `file://`, UNC paths).
 *
 * There is a standing rule in this codebase: never assign
 * `cell.value = { formula: ... }` anywhere. Nothing in this application has a
 * legitimate reason to write a formula, so any formula in an export is a bug.
 */

export { isSafeExternalUrl } from "@/lib/url";

/**
 * Characters that make Excel, LibreOffice or Sheets treat a cell as a formula.
 *
 * The leading tab and carriage return are included because both are stripped
 * during import, revealing the character behind them — so "\t=1+1" becomes
 * "=1+1" after the strip and evaluates.
 */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

function startsWithTrigger(value: string): boolean {
  return value.length > 0 && FORMULA_TRIGGERS.has(value[0]);
}

/**
 * Neutralize a value for a spreadsheet text cell.
 *
 * Prefixes an apostrophe when the value would otherwise be evaluated. The
 * apostrophe is a display directive, not content — Excel shows the original
 * text and copies out the original text.
 */
export function sanitizeCellText(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return startsWithTrigger(text) ? `'${text}` : text;
}

/**
 * Render one value as a CSV field: injection-guarded, quoted, and with any
 * embedded quotes doubled.
 *
 * Always quoted rather than only-when-necessary. It is valid CSV either way,
 * and unconditional quoting removes a whole class of "did I remember to check
 * for a comma" bugs.
 */
export function sanitizeCsvCell(value: unknown): string {
  const guarded = sanitizeCellText(value);
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Join pre-sanitized fields into a CSV row. */
export function csvRow(values: readonly unknown[]): string {
  return values.map(sanitizeCsvCell).join(",");
}

/**
 * Build a complete CSV document.
 *
 * Uses CRLF line endings, which RFC 4180 specifies and Excel on Windows
 * expects. The caller is responsible for prepending a BOM if the file needs to
 * survive being double-clicked on a non-UTF-8 Windows locale — see
 * `withUtf8Bom`.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [csvRow(headers), ...rows.map(csvRow)].join("\r\n");
}

/**
 * Prepend a UTF-8 byte-order mark.
 *
 * Without it, Excel on a Windows machine with a non-UTF-8 system locale
 * misreads accented characters in business names — "Café Rouge" becomes
 * "CafÃ© Rouge". The BOM costs three bytes and is ignored by everything else.
 */
export function withUtf8Bom(csv: string): string {
  // Written as an escape, not a literal: a bare U+FEFF is invisible in an
  // editor and reads as a stray character or a bug.
  return `\u{FEFF}${csv}`;
}
