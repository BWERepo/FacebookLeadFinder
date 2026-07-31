import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_ACTIONS,
  APP_ROLES,
  CONFIDENCE_BANDS,
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MEDIUM_MIN,
  DUPLICATE_CERTAINTIES,
  DUPLICATE_POLICIES,
  EMAIL_STATUSES,
  EXCLUDED_DOMAIN_KINDS,
  EXPORT_FORMATS,
  IMPORT_FILE_TYPES,
  IMPORT_STATUSES,
  LEAD_STATUSES,
  PROCESSING_STATES,
  QUALIFYING_WEBSITE_STATUSES,
  SEARCH_PHASES,
  SEARCH_STATUSES,
  SEARCH_TYPES,
  TERMINAL_SEARCH_STATUSES,
  WEBSITE_STATUSES,
  WEBSITE_STATUS_LABELS,
  confidenceBandFor,
  isQualifyingStatus,
  isTerminalSearchStatus,
} from "./domain";

// ---------------------------------------------------------------------------
// Schema drift guard
//
// Migrations here are applied by hand in the hosted Supabase SQL editor, so
// nothing automatically proves that the vocabularies in domain.ts still match
// the CHECK constraints in the schema. These tests read the migration SQL and
// do exactly that. If someone adds a lead_status to the app and forgets the
// migration (or the reverse), this fails at `npm test` instead of at 2am as a
// constraint violation.
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "supabase", "migrations");

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

const SQL = allMigrationSql();

/**
 * The body of one `CREATE TABLE public.<name> (...)` statement.
 *
 * Needed because a bare column name is not unique across the schema — both
 * `searches` and `imports` have a `status` column with different vocabularies.
 */
function tableBody(table: string): string {
  const start = SQL.indexOf(`CREATE TABLE public.${table} (`);
  if (start === -1) throw new Error(`No CREATE TABLE public.${table} found in migrations`);
  const end = SQL.indexOf("\n);", start);
  if (end === -1) throw new Error(`Unterminated CREATE TABLE public.${table}`);
  return SQL.slice(start, end);
}

/**
 * Pull the literal list out of `CHECK (<column> IN ('a', 'b', ...))`.
 *
 * The constraint may wrap across lines and may be qualified
 * (`duplicate_certainty IS NULL OR duplicate_certainty IN (...)`), so match on
 * the column name followed by IN and take the parenthesized group. Pass a
 * table name to disambiguate a column that exists on more than one table.
 *
 * Defaults to the FIRST match, since some columns legitimately have a second,
 * narrower `... IN (...)` elsewhere for an unrelated constraint (e.g.
 * `leads.website_status` also appears inside `leads_qualified_requires_evidence`,
 * a subset used only there — matching that instead of the real column
 * definition would be wrong). Pass `useLast: true` for a column whose CHECK
 * was later widened in place via `ALTER TABLE ... DROP CONSTRAINT ... ADD
 * CONSTRAINT` (e.g. `lead_activities.action`) — there, the last occurrence in
 * migration file order is the one actually enforced by the database today.
 */
function checkValues(
  column: string,
  table?: string,
  options: { useLast?: boolean } = {},
): string[] {
  const haystack = table ? tableBody(table) : SQL;
  const pattern = new RegExp(`\\b${column}\\s+IN\\s*\\(([^)]*)\\)`, "gi");
  const matches = [...haystack.matchAll(pattern)];
  if (matches.length === 0) {
    throw new Error(`No CHECK (... ${column} IN (...)) found${table ? ` on public.${table}` : ""}`);
  }
  const chosen = options.useLast ? matches[matches.length - 1] : matches[0];
  return [...chosen[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/** Enum values from `CREATE TYPE <name> AS ENUM (...)`. */
function enumValues(typeName: string): string[] {
  const pattern = new RegExp(
    `CREATE TYPE\\s+public\\.${typeName}\\s+AS ENUM\\s*\\(([^)]*)\\)`,
    "i",
  );
  const match = SQL.match(pattern);
  if (!match) throw new Error(`No CREATE TYPE public.${typeName} found in migrations`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

describe("domain vocabularies match the database schema", () => {
  it("found migration files to check against", () => {
    // Guards the guard: if the path were wrong, every check below would throw
    // rather than silently pass, but this makes the failure obvious.
    expect(SQL.length).toBeGreaterThan(1000);
    expect(SQL).toContain("CREATE TABLE public.leads");
  });

  it("app_role", () => {
    expect(enumValues("app_role").sort()).toEqual([...APP_ROLES].sort());
  });

  it("leads.website_status", () => {
    expect(checkValues("website_status").sort()).toEqual([...WEBSITE_STATUSES].sort());
  });

  it("leads.email_status", () => {
    expect(checkValues("email_status").sort()).toEqual([...EMAIL_STATUSES].sort());
  });

  it("leads.confidence_band", () => {
    expect(checkValues("confidence_band").sort()).toEqual([...CONFIDENCE_BANDS].sort());
  });

  it("leads.lead_status", () => {
    expect(checkValues("lead_status").sort()).toEqual([...LEAD_STATUSES].sort());
  });

  it("searches.search_type", () => {
    expect(checkValues("search_type").sort()).toEqual([...SEARCH_TYPES].sort());
  });

  it("searches.status", () => {
    expect(checkValues("status", "searches").sort()).toEqual([...SEARCH_STATUSES].sort());
  });

  it("imports.status", () => {
    expect(checkValues("status", "imports").sort()).toEqual([...IMPORT_STATUSES].sort());
  });

  it("searches.phase", () => {
    expect(checkValues("phase").sort()).toEqual([...SEARCH_PHASES].sort());
  });

  it("search_results.processing_state", () => {
    expect(checkValues("processing_state").sort()).toEqual([...PROCESSING_STATES].sort());
  });

  it("search_results.duplicate_certainty", () => {
    expect(checkValues("duplicate_certainty").sort()).toEqual([...DUPLICATE_CERTAINTIES].sort());
  });

  it("excluded_domains.kind", () => {
    expect(checkValues("kind").sort()).toEqual([...EXCLUDED_DOMAIN_KINDS].sort());
  });

  it("imports.file_type", () => {
    expect(checkValues("file_type").sort()).toEqual([...IMPORT_FILE_TYPES].sort());
  });

  it("imports.on_duplicate", () => {
    expect(checkValues("on_duplicate").sort()).toEqual([...DUPLICATE_POLICIES].sort());
  });

  it("user_settings.export_format", () => {
    expect(checkValues("export_format").sort()).toEqual([...EXPORT_FORMATS].sort());
  });

  it("lead_activities.action", () => {
    expect(checkValues("action", undefined, { useLast: true }).sort()).toEqual(
      [...ACTIVITY_ACTIONS].sort(),
    );
  });
});

describe("qualification vocabulary", () => {
  it("only 'no website found' and 'facebook only' can qualify a lead", () => {
    expect([...QUALIFYING_WEBSITE_STATUSES]).toEqual(["no_website_found", "facebook_only"]);
  });

  it("isQualifyingStatus rejects every uncertain status", () => {
    expect(isQualifyingStatus("no_website_found")).toBe(true);
    expect(isQualifyingStatus("facebook_only")).toBe(true);
    expect(isQualifyingStatus("website_found")).toBe(false);
    expect(isQualifyingStatus("needs_manual_review")).toBe(false);
    expect(isQualifyingStatus("unable_to_verify")).toBe(false);
  });

  it("matches the CHECK constraint that enforces the same rule in Postgres", () => {
    // The leads table refuses to store qualified = true unless the status is
    // one of these and a Facebook URL is present. Keep the two definitions
    // together so a change to one is visibly a change to both.
    const constraint = SQL.slice(
      SQL.indexOf("leads_qualified_requires_evidence"),
      SQL.indexOf("confidence_score     integer"),
    );
    for (const status of QUALIFYING_WEBSITE_STATUSES) {
      expect(constraint).toContain(`'${status}'`);
    }
    expect(constraint).toContain("normalized_facebook_url IS NOT NULL");
  });

  it("every website status has a display label", () => {
    for (const status of WEBSITE_STATUSES) {
      expect(WEBSITE_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("confidence bands", () => {
  it("maps scores to the documented bands", () => {
    expect(confidenceBandFor(100)).toBe("high");
    expect(confidenceBandFor(CONFIDENCE_HIGH_MIN)).toBe("high");
    expect(confidenceBandFor(CONFIDENCE_HIGH_MIN - 1)).toBe("medium");
    expect(confidenceBandFor(CONFIDENCE_MEDIUM_MIN)).toBe("medium");
    expect(confidenceBandFor(CONFIDENCE_MEDIUM_MIN - 1)).toBe("manual");
    expect(confidenceBandFor(0)).toBe("manual");
  });

  it("leaves no gap between the bands", () => {
    for (let score = 0; score <= 100; score++) {
      expect(CONFIDENCE_BANDS).toContain(confidenceBandFor(score));
    }
  });
});

describe("terminal search statuses", () => {
  it("running and pending are not terminal", () => {
    expect(isTerminalSearchStatus("pending")).toBe(false);
    expect(isTerminalSearchStatus("running")).toBe(false);
  });

  it("every other status is terminal", () => {
    const nonTerminal = SEARCH_STATUSES.filter((s) => !isTerminalSearchStatus(s));
    expect(nonTerminal).toEqual(["pending", "running"]);
    expect(TERMINAL_SEARCH_STATUSES).toHaveLength(SEARCH_STATUSES.length - 2);
  });
});
