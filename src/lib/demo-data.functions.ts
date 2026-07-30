/**
 * Server functions for Phase 7's demo data toggle.
 *
 * The pool is shared (RLS lets every member see every lead — see the leads
 * migration), so "load demo data" is a whole-workspace action, not a
 * per-user one: it inserts once and any member can remove it later. Both
 * actions log a single summary `lead_activities` row (`lead_id: null`, count
 * in `detail`) rather than one per lead — 26 "demo_data_loaded" rows would
 * bury the real activity log in noise for no benefit.
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildDemoLeadRows } from "@/lib/demo-data";

export const getDemoDataStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true);
    if (error) throw new Error(error.message);
    return { loaded: (count ?? 0) > 0, count: count ?? 0 };
  });

export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count: existing, error: countError } = await context.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true);
    if (countError) throw new Error(countError.message);
    if ((existing ?? 0) > 0) {
      throw new Error("Demo data is already loaded. Remove it first to reload.");
    }

    const rows = buildDemoLeadRows(context.userId);
    const { error } = await context.supabase.from("leads").insert(rows as any);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      actor_id: context.userId,
      action: "demo_data_loaded",
      description: `Loaded ${rows.length} demo leads`,
      detail: { count: rows.length },
    });

    return { ok: true, count: rows.length };
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("leads")
      .delete({ count: "exact" })
      .eq("is_demo", true);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      actor_id: context.userId,
      action: "demo_data_removed",
      description: `Removed ${count ?? 0} demo leads`,
      detail: { count: count ?? 0 },
    });

    return { ok: true, count: count ?? 0 };
  });
