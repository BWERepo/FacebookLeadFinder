/**
 * Lead read/write server functions.
 *
 * `listLeadsForSearch` is the original, narrow query the Find Leads page uses
 * to show results as a search runs. Everything below it is Phase 6: the full
 * Saved Leads table (filter/sort/paginate, bulk archive/delete) and the lead
 * details page (single-lead read, field edits, notes, activity timeline).
 *
 * Every write that changes a lead's meaningful state also inserts a
 * `lead_activities` row in the same handler — that table has no UPDATE/DELETE
 * grant (see its migration), so the timeline can't be edited after the fact,
 * only added to.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEAD_STATUSES, WEBSITE_STATUSES } from "@/lib/domain";

const listForSearchSchema = z.object({ searchId: z.string().uuid() });

export const listLeadsForSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listForSearchSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("source_search_id", data.searchId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------------------------------------------------------------------
// listLeads — the Saved Leads table
// ---------------------------------------------------------------------------

const LEAD_SORT_COLUMNS = [
  "created_at",
  "business_name",
  "confidence_score",
  "lead_status",
  "next_followup_date",
] as const;

const listLeadsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  websiteStatus: z.enum(WEBSITE_STATUSES).optional(),
  qualifiedOnly: z.boolean().optional(),
  categorySlug: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  sortBy: z.enum(LEAD_SORT_COLUMNS).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listLeadsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("leads").select("*", { count: "exact" });

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

    const from = (data.page - 1) * data.pageSize;
    query = query
      .order(data.sortBy, { ascending: data.sortDir === "asc" })
      .range(from, from + data.pageSize - 1);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// ---------------------------------------------------------------------------
// getLead — the details page
// ---------------------------------------------------------------------------

const leadIdSchema = z.object({ leadId: z.string().uuid() });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => leadIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.leadId)
      .single();
    if (error) throw new Error(error.message);

    const [{ data: notes, error: notesError }, { data: activities, error: activitiesError }] =
      await Promise.all([
        context.supabase
          .from("lead_notes")
          .select("*")
          .eq("lead_id", data.leadId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("lead_activities")
          .select("*")
          .eq("lead_id", data.leadId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
    if (notesError) throw new Error(notesError.message);
    if (activitiesError) throw new Error(activitiesError.message);

    return { lead, notes: notes ?? [], activities: activities ?? [] };
  });

// ---------------------------------------------------------------------------
// updateLeadFields — the editable pipeline fields on the details page
// ---------------------------------------------------------------------------

const updateLeadFieldsSchema = z.object({
  leadId: z.string().uuid(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  lastContactDate: z.string().nullable().optional(),
  nextFollowupDate: z.string().nullable().optional(),
  opportunityScore: z.number().int().min(0).max(100).nullable().optional(),
  estimatedValueCents: z.number().int().min(0).nullable().optional(),
});

export const updateLeadFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateLeadFieldsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { leadId, ...rest } = data;
    const patch: Record<string, unknown> = {};
    if (rest.leadStatus !== undefined) patch.lead_status = rest.leadStatus;
    if (rest.lastContactDate !== undefined) patch.last_contact_date = rest.lastContactDate;
    if (rest.nextFollowupDate !== undefined) patch.next_followup_date = rest.nextFollowupDate;
    if (rest.opportunityScore !== undefined) patch.opportunity_score = rest.opportunityScore;
    if (rest.estimatedValueCents !== undefined)
      patch.estimated_value_cents = rest.estimatedValueCents;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("leads")
      .update(patch as any)
      .eq("id", leadId);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: context.userId,
      action: rest.leadStatus !== undefined ? "status_changed" : "updated",
      description:
        rest.leadStatus !== undefined ? `Status changed to ${rest.leadStatus}` : "Lead updated",
      detail: patch as any,
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

const addNoteSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addNoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: note, error } = await context.supabase
      .from("lead_notes")
      .insert({ lead_id: data.leadId, author_id: context.userId, body: data.body })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      action: "note_added",
      description: "Note added",
      detail: {},
    });

    return note;
  });

const deleteNoteSchema = z.object({ noteId: z.string().uuid() });

export const deleteLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteNoteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_notes").delete().eq("id", data.noteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// archive / unarchive / delete — single and bulk
// ---------------------------------------------------------------------------

const idsSchema = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) });

export const archiveLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ archived_at: new Date().toISOString() })
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert(
      data.leadIds.map((leadId) => ({
        lead_id: leadId,
        actor_id: context.userId,
        action: data.leadIds.length > 1 ? "bulk_archived" : "archived",
        description: "Lead archived",
        detail: { count: data.leadIds.length },
      })),
    );

    return { ok: true, count: data.leadIds.length };
  });

export const unarchiveLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ archived_at: null })
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert(
      data.leadIds.map((leadId) => ({
        lead_id: leadId,
        actor_id: context.userId,
        action: "unarchived",
        description: "Lead unarchived",
        detail: {},
      })),
    );

    return { ok: true, count: data.leadIds.length };
  });

/**
 * Deletes log the activity row before the delete, so it still carries a live
 * `lead_id` foreign key at insert time. `lead_activities.lead_id` is
 * `ON DELETE SET NULL`, so once the lead itself is gone the row survives with
 * `lead_id` nulled out by the FK, keeping `detail.business_name` as the only
 * remaining identifier — exactly the "orphaned row stays meaningful" design
 * described in that table's migration.
 */
export const deleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("leads")
      .select("id, business_name")
      .in("id", data.leadIds);

    await context.supabase.from("lead_activities").insert(
      (rows ?? []).map((row: { id: string; business_name: string }) => ({
        lead_id: row.id,
        actor_id: context.userId,
        action: data.leadIds.length > 1 ? "bulk_deleted" : "deleted",
        description: `Deleted lead: ${row.business_name}`,
        detail: { business_name: row.business_name },
      })),
    );

    const { error } = await context.supabase.from("leads").delete().in("id", data.leadIds);
    if (error) throw new Error(error.message);

    return { ok: true, count: data.leadIds.length };
  });
