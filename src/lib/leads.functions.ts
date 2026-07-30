/**
 * Lead read/write server functions.
 *
 * This file currently exposes only what the Find Leads page needs to show
 * results as a search runs (`listLeadsForSearch`). The full leads table —
 * filtering, sorting, pagination, bulk actions, notes, activity — lands in
 * Phase 6 and extends this file rather than replacing it.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
