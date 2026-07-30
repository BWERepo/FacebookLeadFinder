import { describe, expect, it } from "vitest";

import {
  buildCsv,
  csvRow,
  isSafeExternalUrl,
  sanitizeCellText,
  sanitizeCsvCell,
  withUtf8Bom,
} from "./export-sanitize";

describe("sanitizeCellText", () => {
  it("leaves ordinary values untouched", () => {
    expect(sanitizeCellText("Bergstrom Hydronics")).toBe("Bergstrom Hydronics");
    expect(sanitizeCellText("865-555-0142")).toBe("865-555-0142");
    expect(sanitizeCellText("Knoxville, TN")).toBe("Knoxville, TN");
  });

  it("neutralizes every formula trigger character", () => {
    // The spec's named case: a cell beginning with =, +, - or @.
    expect(sanitizeCellText("=1+1")).toBe("'=1+1");
    expect(sanitizeCellText("+1+1")).toBe("'+1+1");
    expect(sanitizeCellText("-1+1")).toBe("'-1+1");
    expect(sanitizeCellText("@SUM(1,1)")).toBe("'@SUM(1,1)");
  });

  it("neutralizes the DDE command-execution payload", () => {
    const payload = `=cmd|'/c calc'!A1`;
    expect(sanitizeCellText(payload)).toBe(`'${payload}`);
  });

  it("neutralizes leading whitespace that would be stripped on import", () => {
    // "\t=1+1" loses the tab during import and the "=" then evaluates.
    expect(sanitizeCellText("\t=1+1")).toBe("'\t=1+1");
    expect(sanitizeCellText("\r=1+1")).toBe("'\r=1+1");
  });

  it("does not touch a trigger character in the middle of a value", () => {
    // Only the first character determines whether Excel evaluates the cell.
    expect(sanitizeCellText("Smith + Sons")).toBe("Smith + Sons");
    expect(sanitizeCellText("info@example.com")).toBe("info@example.com");
  });

  it("handles null, undefined and non-strings", () => {
    expect(sanitizeCellText(null)).toBe("");
    expect(sanitizeCellText(undefined)).toBe("");
    expect(sanitizeCellText(0)).toBe("0");
    expect(sanitizeCellText(42)).toBe("42");
    expect(sanitizeCellText(false)).toBe("false");
  });

  it("guards a negative number, accepting the cosmetic cost", () => {
    // -5 arrives as text in this pipeline and cannot be distinguished from a
    // "-cmd|..." payload, so it is guarded. An apostrophe on a rare negative
    // value is a better trade than an evaluated cell.
    expect(sanitizeCellText("-5")).toBe("'-5");
  });
});

describe("sanitizeCsvCell", () => {
  it("always quotes", () => {
    expect(sanitizeCsvCell("plain")).toBe('"plain"');
  });

  it("doubles embedded quotes", () => {
    expect(sanitizeCsvCell(`Joe "The Plumber" Smith`)).toBe('"Joe ""The Plumber"" Smith"');
  });

  it("keeps commas and newlines safely inside the quotes", () => {
    expect(sanitizeCsvCell("Knoxville, TN")).toBe('"Knoxville, TN"');
    expect(sanitizeCsvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("applies the injection guard inside the quotes", () => {
    expect(sanitizeCsvCell("=1+1")).toBe(`"'=1+1"`);
  });

  it("cannot be escaped by combining a quote with a formula", () => {
    // The classic bypass attempt: close the quote, then start a formula.
    const attack = `","=1+1`;
    const result = sanitizeCsvCell(attack);
    // Every embedded quote is doubled, so the field never terminates early and
    // the "=1+1" stays inside it as literal text rather than starting a new
    // field that Excel would evaluate.
    expect(result).toBe(`""",""=1+1"`);
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // The payload never begins a field.
    expect(result).not.toMatch(/(^|,)"=/);
  });
});

describe("csvRow and buildCsv", () => {
  it("joins fields with commas", () => {
    expect(csvRow(["a", "b"])).toBe('"a","b"');
  });

  it("builds a document with a header row and CRLF endings", () => {
    const csv = buildCsv(["Business", "City"], [["Bergstrom Hydronics", "Knoxville"]]);
    expect(csv).toBe('"Business","City"\r\n"Bergstrom Hydronics","Knoxville"');
  });

  it("guards a malicious value in a data row", () => {
    const csv = buildCsv(["Business"], [["=cmd|'/c calc'!A1"]]);
    expect(csv).toContain(`"'=cmd|'/c calc'!A1"`);
    // The bare payload never appears unguarded at the start of a field.
    expect(csv).not.toContain(`,"=cmd`);
    expect(csv).not.toContain(`\r\n"=cmd`);
  });

  it("handles an empty row set", () => {
    expect(buildCsv(["Business"], [])).toBe('"Business"');
  });
});

describe("withUtf8Bom", () => {
  it("prepends the BOM so Excel reads accents correctly", () => {
    const result = withUtf8Bom('"Café Rouge"');
    expect(result.charCodeAt(0)).toBe(0xfeff);
    expect(result.slice(1)).toBe('"Café Rouge"');
  });
});

describe("isSafeExternalUrl — the hyperlink-cell guard", () => {
  it("accepts the Facebook URLs that become live hyperlinks", () => {
    expect(isSafeExternalUrl("https://facebook.com/BergstromHydronics")).toBe(true);
    expect(isSafeExternalUrl("http://facebook.com/BergstromHydronics")).toBe(true);
  });

  it("rejects what would make a hyperlink dangerous", () => {
    // These are the reason hyperlink cells get URL validation instead of the
    // apostrophe prefix — the prefix would corrupt a good URL and would not
    // help against a bad one.
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("file://server/share/payload.xlsm")).toBe(false);
    expect(isSafeExternalUrl("\\\\server\\share\\payload.xlsm")).toBe(false);
    expect(isSafeExternalUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
  });

  it("rejects empty values", () => {
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
  });
});

describe("the two guards do not interfere", () => {
  it("a URL never gains an apostrophe from the text guard", () => {
    // Regression guard for the mistake this module exists to prevent: applying
    // sanitizeCellText to a hyperlink target would produce "'https://..." and
    // break every link in the export.
    const url = "https://facebook.com/BergstromHydronics";
    expect(sanitizeCellText(url)).toBe(url);
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it("a URL-shaped value that fails validation is still safe as text", () => {
    const bad = "javascript:alert(1)";
    expect(isSafeExternalUrl(bad)).toBe(false);
    // Downgraded to a text cell, where it is inert.
    expect(sanitizeCellText(bad)).toBe(bad);
  });
});
