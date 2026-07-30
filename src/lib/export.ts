/**
 * Phase 9 — CSV/XLSX export of the leads table.
 *
 * The column list and cell values are defined once here and shared by both
 * formats (`export.functions.ts` for CSV, `export.server.ts` for XLSX), so a
 * CSV and an XLSX export of the same filter always agree on which columns
 * exist and what they say — never two hand-maintained lists drifting apart.
 *
 * Pure — no exceljs, no Supabase, no I/O — so the column mapping and CSV
 * builder are unit-testable without a Worker runtime. The formula-injection
 * guards live in export-sanitize.ts and are applied here, not left to the
 * caller to remember.
 */

import { buildCsv, sanitizeCellText, withUtf8Bom } from "@/lib/export-sanitize";
import { LEAD_STATUS_LABELS, WEBSITE_STATUS_LABELS } from "@/lib/domain";
import type { LeadStatus, WebsiteStatus } from "@/lib/domain";

/** The subset of a `leads` row an export needs. Matches `select()` in export.functions.ts. */
export type ExportableLead = {
  business_name: string;
  category: string;
  phone: string;
  email: string | null;
  facebook_url: string | null;
  potential_website_url: string | null;
  address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  website_status: WebsiteStatus;
  qualified: boolean;
  confidence_score: number;
  lead_status: LeadStatus;
  last_contact_date: string | null;
  next_followup_date: string | null;
  opportunity_score: number | null;
  estimated_value_cents: number | null;
  first_found_at: string;
  last_checked_at: string | null;
};

export const EXPORT_COLUMNS: readonly { key: string; header: string }[] = [
  { key: "business_name", header: "Business Name" },
  { key: "category", header: "Category" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "facebook_url", header: "Facebook URL" },
  { key: "potential_website_url", header: "Website URL" },
  { key: "address", header: "Address" },
  { key: "city", header: "City" },
  { key: "county", header: "County" },
  { key: "state", header: "State" },
  { key: "zip", header: "ZIP" },
  { key: "website_status", header: "Website Status" },
  { key: "qualified", header: "Qualified" },
  { key: "confidence_score", header: "Confidence Score" },
  { key: "lead_status", header: "Pipeline Status" },
  { key: "last_contact_date", header: "Last Contact Date" },
  { key: "next_followup_date", header: "Next Follow-up Date" },
  { key: "opportunity_score", header: "Opportunity Score" },
  { key: "estimated_value", header: "Estimated Value" },
  { key: "first_found_at", header: "First Found" },
  { key: "last_checked_at", header: "Last Checked" },
] as const;

function centsToDollarString(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

/** One export row's values, in `EXPORT_COLUMNS` order. Shared by CSV and XLSX. */
export function exportRowValues(lead: ExportableLead): unknown[] {
  return [
    lead.business_name,
    lead.category,
    lead.phone,
    lead.email ?? "",
    lead.facebook_url ?? "",
    lead.potential_website_url ?? "",
    lead.address,
    lead.city,
    lead.county,
    lead.state,
    lead.zip,
    WEBSITE_STATUS_LABELS[lead.website_status],
    lead.qualified ? "Yes" : "No",
    lead.confidence_score,
    LEAD_STATUS_LABELS[lead.lead_status],
    lead.last_contact_date ?? "",
    lead.next_followup_date ?? "",
    lead.opportunity_score ?? "",
    centsToDollarString(lead.estimated_value_cents),
    lead.first_found_at.slice(0, 10),
    lead.last_checked_at ? lead.last_checked_at.slice(0, 10) : "",
  ];
}

export function exportHeaders(): string[] {
  return EXPORT_COLUMNS.map((c) => sanitizeCellText(c.header));
}

/** A complete, injection-guarded, UTF-8-BOM'd CSV document for these leads. */
export function buildLeadsCsv(leads: readonly ExportableLead[]): string {
  const headers = EXPORT_COLUMNS.map((c) => c.header);
  const rows = leads.map(exportRowValues);
  return withUtf8Bom(buildCsv(headers, rows));
}
