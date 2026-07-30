/**
 * Dashboard aggregates.
 *
 * No SQL views or RPCs — this reads one narrow, indexed column set for every
 * active lead and aggregates it in JS, the same "small dataset, aggregate in
 * the handler" approach `searches.functions.ts` already uses for its counters.
 * A prospecting tool's lead volume is thousands, not millions, of rows, so a
 * single bounded `select` stays fast and keeps the whole aggregation readable
 * and testable in one place rather than split across a migration and a
 * handler.
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WEBSITE_STATUSES } from "@/lib/domain";
import type { WebsiteStatus } from "@/lib/domain";

const DASHBOARD_ROW_LIMIT = 20000;
const TREND_DAYS = 14;
const TOP_CATEGORIES = 8;

type DashboardRow = {
  created_at: string;
  website_status: WebsiteStatus;
  qualified: boolean;
  category: string;
  state: string;
};

export type DashboardStats = {
  totalActive: number;
  qualified: number;
  needsReview: number;
  newThisWeek: number;
  byWebsiteStatus: Record<WebsiteStatus, number>;
  byCategory: { category: string; count: number }[];
  byState: { state: string; count: number }[];
  trend: { date: string; count: number }[];
};

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("created_at, website_status, qualified, category, state")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(DASHBOARD_ROW_LIMIT);
    if (error) throw new Error(error.message);

    const leads = (rows ?? []) as DashboardRow[];

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const byWebsiteStatus = Object.fromEntries(WEBSITE_STATUSES.map((s) => [s, 0])) as Record<
      WebsiteStatus,
      number
    >;
    const categoryCounts = new Map<string, number>();
    const stateCounts = new Map<string, number>();
    const trendCounts = new Map<string, number>();

    let qualified = 0;
    let needsReview = 0;
    let newThisWeek = 0;

    for (const lead of leads) {
      byWebsiteStatus[lead.website_status] = (byWebsiteStatus[lead.website_status] ?? 0) + 1;
      if (lead.qualified) qualified++;
      if (lead.website_status === "needs_manual_review") needsReview++;

      const createdAt = new Date(lead.created_at).getTime();
      if (createdAt >= weekAgo) newThisWeek++;

      if (lead.category) {
        categoryCounts.set(lead.category, (categoryCounts.get(lead.category) ?? 0) + 1);
      }
      if (lead.state) {
        stateCounts.set(lead.state, (stateCounts.get(lead.state) ?? 0) + 1);
      }

      const dayKey = lead.created_at.slice(0, 10);
      trendCounts.set(dayKey, (trendCounts.get(dayKey) ?? 0) + 1);
    }

    const byCategory = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_CATEGORIES);

    const byState = Array.from(stateCounts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_CATEGORIES);

    const trend: { date: string; count: number }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      trend.push({ date: day, count: trendCounts.get(day) ?? 0 });
    }

    return {
      totalActive: leads.length,
      qualified,
      needsReview,
      newThisWeek,
      byWebsiteStatus,
      byCategory,
      byState,
      trend,
    };
  });
