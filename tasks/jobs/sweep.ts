// Nitro scheduled task, registered in vite.config.ts (`*/15 * * * *`).
//
// Search jobs are driven by the browser tab that started them: the client calls
// advanceSearch in a loop until the job reaches a terminal status. If that tab
// is closed mid-run, or the machine sleeps, the job is left `running` forever
// with a stale heartbeat. This sweep closes those out as `partially_completed`
// so the partial leads they did find are still presented honestly, rather than
// sitting behind a spinner that will never finish.
//
// Phase 1 stub — the real query lands in phase 5 with the job engine.

export default defineTask({
  meta: {
    name: "jobs:sweep",
    description: "Close out search jobs whose driving client went away",
  },
  async run() {
    return { result: "noop: job engine arrives in phase 5" };
  },
});

// Nitro injects `defineTask` as a global at build time; declare it so
// TypeScript and ESLint don't treat it as undefined.
declare function defineTask<T>(definition: {
  meta: { name: string; description?: string };
  run: (ctx: unknown) => Promise<T> | T;
}): unknown;
