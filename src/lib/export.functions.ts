/**
 * Phase 9 — export the Saved Leads table's current filter to CSV or XLSX.
 *
 * Filters mirror `listLeadsSchema` in leads.functions.ts exactly (minus
 * pagination/sort, which don't matter for a full export) so "export what I'm
 * looking at" always matches what the table actually shows. A `createServerFn`
 * can't stream a raw HTTP response with a Content-Disposition header, so this
 * returns the file as base64 and the client turns it into a downloaded Blob —
 * simple, and fine at this app's lead volume (see the row cap below).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPORT_FORMATS, LEAD_STATUSES, WEBSITE_STATUSES } from "@/lib/domain";
import { buildLeadsCsv, type ExportableLead } from "@/lib/export";
import { buildLeadsWorkbookBuffer } from "@/lib/export.server";

/** A prospecting tool's lead volume is thousands, not millions — see dashboard.functions.ts. */
const MAX_EXPORT_ROWS = 10000;

const EXPORT_SELECT =
  "business_name, category, phone, email, facebook_url, potential_website_url, address, city, county, state, zip, website_status, qualified, confidence_score, lead_status, last_contact_date, next_followup_date, opportunity_score, estimated_value_cents, first_found_at, last_checked_at";

const exportLeadsSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  search: z.string().trim().max(200).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  websiteStatus: z.enum(WEBSITE_STATUSES).optional(),
  qualifiedOnly: z.boolean().optional(),
  categorySlug: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
});

export const exportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => exportLeadsSchema.parse(data))
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("leads").select(EXPORT_SELECT);

    if (data.archived === "active") query = query.is("archived_at", null);
    if (data.archived === "archived") query = query.not("archived_at", "is", null);
    if (data.leadStatus) query = query.eq("lead_status", data.leadStatus);
    if (data.websiteStatus) query = query.eq("website_status", data.websiteStatus);
    if (data.qualifiedOnly) query = query.eq("qualified", true);
    if (data.categorySlug) query = query.eq("category_slug", data.categorySlug);
    if (data.state) query = query.eq("state", data.state.toUpperCase());
    if (data.search) {
      const term = data.search.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(
        `business_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,city.ilike.%${term}%`,
      );
    }

    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    if (error) throw new Error(error.message);

    const leads = (rows ?? []) as ExportableLead[];
    const stamp = new Date().toISOString().slice(0, 10);

    const result =
      data.format === "csv"
        ? {
            filename: `leads-${stamp}.csv`,
            mimeType: "text/csv;charset=utf-8",
            base64: Buffer.from(buildLeadsCsv(leads), "utf-8").toString("base64"),
            count: leads.length,
          }
        : {
            filename: `leads-${stamp}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            base64: (await buildLeadsWorkbookBuffer(leads)).toString("base64"),
            count: leads.length,
          };

    await context.supabase.from("lead_activities").insert({
      actor_id: context.userId,
      action: "exported",
      description: `Exported ${result.count} lead(s) as ${data.format.toUpperCase()}`,
      detail: { format: data.format, count: result.count },
    });

    return result;
  });
