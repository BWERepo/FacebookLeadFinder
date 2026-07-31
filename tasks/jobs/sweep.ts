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
    const staleBefore = new Date(Date.now() - SWEEP_STALE_MS).toISOString();

    // A `running` job with a stale (or missing) heartbeat, or a `pending` job
    // that never even got its first chunk before its creator's tab vanished.
    const { data: staleJobs, error } = await supabaseAdmin
      .from("searches")
      .select("id")
      .in("status", ["pending", "running"])
      .or(`heartbeat_at.lt.${staleBefore},and(heartbeat_at.is.null,created_at.lt.${staleBefore})`);

    if (error) {
      console.error("[jobs:sweep] query failed:", error.message);
      return { result: "error", message: error.message };
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

    return { result: "ok", checked: jobs.length, closed };
  },
});

// Nitro injects `defineTask` as a global at build time; declare it so
// TypeScript and ESLint don't treat it as undefined.
declare function defineTask<T>(definition: {
  meta: { name: string; description?: string };
  run: (ctx: unknown) => Promise<T> | T;
}): unknown;
