/**
 * Phase 10 — column mapping and per-row validation for the CSV/XLSX import
 * wizard.
 *
 * Pure — no Supabase, no file parsing — so the mapping/validation rules are
 * unit-testable without a Worker runtime. File parsing lives in
 * import-parse.server.ts; the duplicate-against-existing-leads check needs a
 * DB round trip and lives in import.functions.ts.
 *
 * An imported lead is never claimed to be website-verified — the app never
 * ran its own checks against it, so `website_status` is always
 * `needs_manual_review` and `qualified` is always false for every row this
 * module produces, regardless of what a "Website" column in the file says.
 * See COMPLIANCE.md and the same rule already applied to demo-data.ts.
 */

import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeEmail,
  normalizeFacebookUrl,
  normalizePhone,
} from "@/lib/dedupe";
import { resolveCategory } from "@/lib/categories";
import { isValidEmail } from "@/lib/url";

export const IMPORT_TARGET_FIELDS = [
  { key: "business_name", label: "Business Name", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "email", label: "Email", required: false },
  { key: "facebook_url", label: "Facebook URL", required: false },
  { key: "website_url", label: "Website URL", required: false },
  { key: "address", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "county", label: "County", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip", label: "ZIP", required: false },
  { key: "category", label: "Category", required: false },
] as const;

export type ImportTargetKey = (typeof IMPORT_TARGET_FIELDS)[number]["key"];

/** `{ leadColumn: sourceHeader }` — matches the shape documented on `imports.column_mapping`. */
export type ColumnMapping = Partial<Record<ImportTargetKey, string>>;

/** Best-effort auto-mapping: match each target field to a header with the same (loosely) name. */
export function autoMapColumns(headers: readonly string[]): ColumnMapping {
  const normalized = headers.map((h) => ({
    header: h,
    key: h
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ""),
  }));
  const aliases: Record<ImportTargetKey, string[]> = {
    business_name: ["businessname", "business", "name", "company", "companyname"],
    phone: ["phone", "phonenumber", "telephone"],
    email: ["email", "emailaddress"],
    facebook_url: ["facebook", "facebookurl", "facebookpage"],
    website_url: ["website", "websiteurl", "url"],
    address: ["address", "streetaddress", "street"],
    city: ["city"],
    county: ["county"],
    state: ["state", "province"],
    zip: ["zip", "zipcode", "postalcode"],
    category: ["category", "industry", "type"],
  };

  const mapping: ColumnMapping = {};
  for (const field of IMPORT_TARGET_FIELDS) {
    const match = normalized.find((n) => aliases[field.key].includes(n.key));
    if (match) mapping[field.key] = match.header;
  }
  return mapping;
}

/** Zip a header row and a data row into `{ header: value }`. */
export function rowToRecord(
  headers: readonly string[],
  row: readonly string[],
): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = row[i] ?? "";
  });
  return record;
}

export type RawImportFields = Record<ImportTargetKey, string>;

/** Apply the column mapping to one row's record, producing the raw (un-normalized) field values. */
export function applyMapping(
  record: Record<string, string>,
  mapping: ColumnMapping,
): RawImportFields {
  const result = {} as RawImportFields;
  for (const field of IMPORT_TARGET_FIELDS) {
    const sourceHeader = mapping[field.key];
    result[field.key] = sourceHeader ? (record[sourceHeader] ?? "").trim() : "";
  }
  return result;
}

export type ImportRowValidation = { valid: true } | { valid: false; reason: string };

/** The only rules a lenient bulk import enforces: a name, and a well-formed email if one was given. */
export function validateImportRow(raw: RawImportFields): ImportRowValidation {
  if (raw.business_name.trim() === "") {
    return { valid: false, reason: "Business Name is required" };
  }
  if (raw.email.trim() !== "" && !isValidEmail(raw.email)) {
    return { valid: false, reason: `"${raw.email}" is not a valid email address` };
  }
  return { valid: true };
}

/** The insertable `leads` row shape for one valid raw row — everything except created_by/source_import_id. */
export function buildImportLeadFields(raw: RawImportFields): Record<string, unknown> {
  const category = resolveCategory(raw.category);
  const normalizedPhone = normalizePhone(raw.phone);

  return {
    business_name: raw.business_name,
    normalized_name: normalizeBusinessName(raw.business_name),
    category: category.label,
    category_slug: category.slug,
    address: raw.address,
    normalized_address: normalizeAddress(raw.address),
    city: raw.city,
    county: raw.county,
    state: raw.state.toUpperCase().slice(0, 2),
    zip: raw.zip,
    phone: raw.phone,
    normalized_phone: normalizedPhone,
    area_code: normalizedPhone?.slice(0, 3) ?? null,
    email: raw.email || null,
    normalized_email: normalizeEmail(raw.email),
    email_status: raw.email ? "unverified" : "not_found",
    facebook_url: raw.facebook_url || null,
    normalized_facebook_url: normalizeFacebookUrl(raw.facebook_url),
    // Never verified by this app — see this file's header comment.
    website_status: "needs_manual_review",
    potential_website_url: raw.website_url || null,
    qualified: false,
    confidence_score: 0,
    confidence_band: "manual",
    confidence_breakdown: [],
    verification_notes: "Imported from a file; not yet verified.",
    sources: [],
    provider: "import",
    is_demo: false,
  };
}
