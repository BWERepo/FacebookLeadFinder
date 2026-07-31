// Nitro scheduled task, registered in vite.config.ts (`*/15 * * * *`).
//
// Search jobs are driven by the browser tab that started them: the client calls
// advanceSearch in a loop until the job reaches a terminal status. If that tab
// is closed mid-run, or the machine sleeps, the job is left `running` (or
// `pending`, if it never got its first chunk) forever with a stale heartbeat.
// This sweep closes those out as `partially_completed` so the partial leads
// they did find are still presented honestly, rather than sitting behind a
// spinner that will never finish. Always `partially_completed`, never
// `completed` or `failed` — a sweep-closed job is by definition one whose
// actual outcome nobody ever confirmed, and "partially completed" is the
// honest description of that regardless of how many leads it happened to find
// before going stale.
//
// A second, separate case: cancelSearch only *requests* a cancellation
// (`cancel_requested = true`) — it takes effect on the driving client's next
// advanceSearch call, which is the one that actually flips status to
// `cancelled` (see use-search-job.ts's cancel()). If that tab was closed, or
// navigated away from, before making one more call — clicking Cancel and then
// closing the tab is the obvious way this happens — the job is left
// `running`/`pending` forever with cancel_requested already true, regardless
// of how fresh its heartbeat is. This sweep finalizes those immediately,
// without waiting for the heartbeat to go stale, since a cancel request is an
// explicit instruction, not something to leave sitting for up to
// SWEEP_STALE_MS.
//
// Runs with the service-role client (no user session exists in a scheduled
// task), same as the demo seeder — see client.server.ts.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SWEEP_STALE_MS } from "@/lib/job-state";

export default defineTask({
  meta: {
    name: "jobs:sweep",
    description: "Close out search jobs whose driving client went away",
  },
  async run() {
    // --- 1. Finish any cancellation the driving client never got to confirm ---

    const { data: cancelRequested, error: cancelQueryError } = await supabaseAdmin
      .from("searches")
      .select("id, created_by")
      .in("status", ["pending", "running"])
      .eq("cancel_requested", true);

    if (cancelQueryError) {
      console.error("[jobs:sweep] cancel-requested query failed:", cancelQueryError.message);
      return { result: "error", message: cancelQueryError.message };
    }

    let cancelled = 0;
    for (const job of cancelRequested ?? []) {
      const { error: updateError } = await supabaseAdmin
        .from("searches")
        .update({
          status: "cancelled",
          phase: "done",
          lease_token: null,
          lease_expires_at: null,
          ended_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["pending", "running"]); // re-check status: don't clobber a job that just finished
      if (updateError) continue;
      cancelled++;
      await supabaseAdmin.from("lead_activities").insert({
        actor_id: job.created_by,
        action: "search_cancelled",
        description: "Search cancelled (finalized by the scheduled sweep)",
        detail: { search_id: job.id },
      });
    }

    // --- 2. Reap jobs whose driving tab went away, cancel or no cancel -------

    const staleBefore = new Date(Date.now() - SWEEP_STALE_MS).toISOString();

    // A `running` job with a stale (or missing) heartbeat, or a `pending` job
    // that never even got its first chunk before its creator's tab vanished.
    const { data: staleJobs, error } = await supabaseAdmin
      .from("searches")
      .select("id")
      .in("status", ["pending", "running"])
      .or(`heartbeat_at.lt.${staleBefore},and(heartbeat_at.is.null,created_at.lt.${staleBefore})`);

    if (error) {
      console.error("[jobs:sweep] stale query failed:", error.message);
      return { result: "error", message: error.message, cancelled };
    }

    const jobs = staleJobs ?? [];
    let closed = 0;

    for (const job of jobs) {
      const { error: updateError } = await supabaseAdmin
        .from("searches")
        .update({
          status: "partially_completed",
          phase: "done",
          lease_token: null,
          lease_expires_at: null,
          ended_at: new Date().toISOString(),
          last_error: "Closed by the scheduled sweep — the driving browser tab went away.",
        })
        .eq("id", job.id)
        .in("status", ["pending", "running"]); // re-check status: don't clobber a job that just finished
      if (!updateError) closed++;
    }

    return { result: "ok", cancelled, checked: jobs.length, closed };
  },
});

// Nitro injects `defineTask` as a global at build time; declare it so
// TypeScript and ESLint don't treat it as undefined.
declare function defineTask<T>(definition: {
  meta: { name: string; description?: string };
  run: (ctx: unknown) => Promise<T> | T;
}): unknown;
