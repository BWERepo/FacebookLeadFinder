/**
 * Phase 10 — server functions behind the CSV/XLSX import wizard.
 *
 * The `imports` row is the durable job record (see its migration): it's
 * created on upload and updated at every step, so a half-finished import is
 * visible in history rather than silently vanishing on a page reload — the
 * same "the row IS the job" idea `searches.functions.ts` uses for search
 * jobs. The parsed rows themselves stay in the client's memory for the
 * wizard's duration rather than being persisted mid-flight — see
 * import-mapping.ts and import-parse.server.ts for why that's a reasonable
 * bound for this app's data volumes.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMPORT_FILE_TYPES, DUPLICATE_POLICIES } from "@/lib/domain";
import { parseImportFile } from "@/lib/import-parse.server";
import {
  IMPORT_TARGET_FIELDS,
  applyMapping,
  buildImportLeadFields,
  rowToRecord,
  validateImportRow,
  type ColumnMapping,
} from "@/lib/import-mapping";
import { findDuplicate, mergePatch, type DedupeCandidate } from "@/lib/dedupe";
import { emailDomain, isFreeEmailDomain } from "@/lib/url";

const MAX_STORED_ERRORS = 200;

const columnMappingSchema: z.ZodType<ColumnMapping> = z.record(
  z.string(),
  z.string(),
) as z.ZodType<ColumnMapping>;

// ---------------------------------------------------------------------------
// uploadImportFile
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.enum(IMPORT_FILE_TYPES),
  base64: z.string().min(1),
});

export const uploadImportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data, context }) => {
    const buffer = Buffer.from(data.base64, "base64");
    const parsed = await parseImportFile(data.fileType, buffer);

    const { data: inserted, error } = await context.supabase
      .from("imports")
      .insert({
        created_by: context.userId,
        filename: data.filename,
        file_type: data.fileType,
        file_size: buffer.length,
        total_rows: parsed.totalRows,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      importId: inserted.id as string,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.totalRows,
      truncated: parsed.truncated,
      targetFields: IMPORT_TARGET_FIELDS,
    };
  });

// ---------------------------------------------------------------------------
// saveColumnMapping
// ---------------------------------------------------------------------------

const saveMappingSchema = z.object({
  importId: z.string().uuid(),
  columnMapping: columnMappingSchema,
  onDuplicate: z.enum(DUPLICATE_POLICIES),
});

export const saveColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveMappingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("imports")
      .update({
        status: "mapped",
        column_mapping: data.columnMapping,
        on_duplicate: data.onDuplicate,
      })
      .eq("id", data.importId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Shared: classify every row as valid/invalid and, for valid rows, find an
// existing-lead match. Used by both validateImport (dry run) and commitImport
// (which re-derives this rather than trusting the client's earlier result).
// ---------------------------------------------------------------------------

type RowOutcome = {
  rowNumber: number; // 1-based, matching the file's data rows (header excluded)
  fields: Record<string, unknown> | null; // null when invalid
  duplicateLeadId: string | null;
  invalidReason: string | null;
};

async function classifyRows(
  supabase: any,
  headers: string[],
  rows: string[][],
  columnMapping: ColumnMapping,
): Promise<RowOutcome[]> {
  const outcomes: RowOutcome[] = [];

  for (let i = 0; i < rows.length; i++) {
    const record = rowToRecord(headers, rows[i]);
    const raw = applyMapping(record, columnMapping);
    const validation = validateImportRow(raw);

    if (!validation.valid) {
      outcomes.push({
        rowNumber: i + 1,
        fields: null,
        duplicateLeadId: null,
        invalidReason: validation.reason,
      });
      continue;
    }

    const fields = buildImportLeadFields(raw);
    const candidate: DedupeCandidate = {
      normalized_name: fields.normalized_name as string,
      normalized_phone: fields.normalized_phone as string | null,
      normalized_email: fields.normalized_email as string | null,
      normalized_facebook_url: fields.normalized_facebook_url as string | null,
      normalized_address: fields.normalized_address as string,
      city: fields.city as string,
      state: fields.state as string,
      zip: fields.zip as string,
      provider: null,
      provider_place_id: null,
    };

    const filters: string[] = [];
    if (candidate.normalized_facebook_url) {
      filters.push(`normalized_facebook_url.eq.${candidate.normalized_facebook_url}`);
    }
    if (candidate.normalized_phone)
      filters.push(`normalized_phone.eq.${candidate.normalized_phone}`);
    if (candidate.normalized_name) filters.push(`normalized_name.eq.${candidate.normalized_name}`);
    if (candidate.normalized_email && !isFreeEmailDomain(emailDomain(candidate.normalized_email))) {
      filters.push(`normalized_email.eq.${candidate.normalized_email}`);
    }

    let existing: any[] = [];
    if (filters.length > 0) {
      const { data } = await supabase
        .from("leads")
        .select(
          "id, normalized_name, normalized_phone, normalized_email, normalized_facebook_url, normalized_address, city, state, zip, provider, provider_place_id",
        )
        .or(filters.join(","))
        .limit(10);
      existing = data ?? [];
    }

    const match = findDuplicate(candidate, existing);

    outcomes.push({
      rowNumber: i + 1,
      fields,
      duplicateLeadId: match?.lead.id ?? null,
      invalidReason: null,
    });
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// validateImport — a dry run: counts and a capped error list, no writes to leads
// ---------------------------------------------------------------------------

const rowsSchema = z.array(z.array(z.string()));

const validateSchema = z.object({
  importId: z.string().uuid(),
  headers: z.array(z.string()),
  rows: rowsSchema,
  columnMapping: columnMappingSchema,
});

export const validateImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => validateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const outcomes = await classifyRows(
      context.supabase,
      data.headers,
      data.rows,
      data.columnMapping,
    );

    const invalid = outcomes.filter((o) => o.invalidReason !== null);
    const valid = outcomes.filter((o) => o.invalidReason === null);
    const duplicates = valid.filter((o) => o.duplicateLeadId !== null);

    const errors = invalid.slice(0, MAX_STORED_ERRORS).map((o) => ({
      row: o.rowNumber + 1, // +1 for the header line, so this matches a spreadsheet row number
      column: "Business Name",
      value: "",
      reason: o.invalidReason,
    }));

    const { error } = await context.supabase
      .from("imports")
      .update({
        status: "validating",
        valid_rows: valid.length,
        invalid_rows: invalid.length,
        duplicate_rows: duplicates.length,
        errors,
      })
      .eq("id", data.importId);
    if (error) throw new Error(error.message);

    return {
      totalRows: outcomes.length,
      validRows: valid.length,
      invalidRows: invalid.length,
      duplicateRows: duplicates.length,
      newRows: valid.length - duplicates.length,
      errors,
    };
  });

// ---------------------------------------------------------------------------
// commitImport — the real writes
// ---------------------------------------------------------------------------

const commitSchema = z.object({
  importId: z.string().uuid(),
  headers: z.array(z.string()),
  rows: rowsSchema,
  columnMapping: columnMappingSchema,
  onDuplicate: z.enum(DUPLICATE_POLICIES),
});

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => commitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const outcomes = await classifyRows(supabase, data.headers, data.rows, data.columnMapping);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errorRows = 0;
    const errors: { row: number; column: string; value: string; reason: string }[] = [];

    for (const outcome of outcomes) {
      if (outcome.invalidReason !== null) {
        errorRows++;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push({
            row: outcome.rowNumber + 1,
            column: "Business Name",
            value: "",
            reason: outcome.invalidReason,
          });
        }
        continue;
      }

      const fields = outcome.fields!;

      if (outcome.duplicateLeadId) {
        if (data.onDuplicate === "skip") {
          skipped++;
          continue;
        }
        const { data: existingLead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", outcome.duplicateLeadId)
          .single();
        if (existingLead) {
          const patch = mergePatch(existingLead as Record<string, unknown>, fields);
          if (Object.keys(patch).length > 0) {
            await supabase
              .from("leads")
              .update(patch as any)
              .eq("id", outcome.duplicateLeadId);
          }
        }
        updated++;
        continue;
      }

      const { error: insertError } = await supabase.from("leads").insert({
        ...fields,
        created_by: context.userId,
        source_import_id: data.importId,
      } as any);
      if (insertError) {
        errorRows++;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push({
            row: outcome.rowNumber + 1,
            column: "",
            value: "",
            reason: insertError.message,
          });
        }
        continue;
      }
      imported++;
    }

    const { data: importRow, error: fetchError } = await supabase
      .from("imports")
      .select("filename")
      .eq("id", data.importId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await supabase
      .from("imports")
      .update({
        status: "completed",
        imported_rows: imported,
        updated_rows: updated,
        skipped_rows: skipped,
        duplicate_rows: updated + skipped,
        error_rows: errorRows,
        errors,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.importId);
    if (error) throw new Error(error.message);

    await supabase.from("lead_activities").insert({
      actor_id: context.userId,
      action: "imported",
      description: `Imported ${imported} new lead(s) from ${importRow.filename} (${updated} updated, ${skipped} skipped, ${errorRows} errors)`,
      detail: { importId: data.importId, imported, updated, skipped, errorRows },
    });

    return { imported, updated, skipped, errorRows };
  });

// ---------------------------------------------------------------------------
// listImports — history
// ---------------------------------------------------------------------------

const listImportsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const listImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listImportsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("imports")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });
