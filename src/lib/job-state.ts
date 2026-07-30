/**
 * The search-job state machine. Pure — takes plain data in, returns a
 * decision, touches nothing.
 *
 * There are no Cloudflare Queues or Durable Objects behind this app, so a
 * `searches` database row IS the durable job, and `search_results` rows are
 * the durable work queue (see supabase/migrations/20260801000300_searches.sql
 * and .../000700_search_results.sql). Each `advanceSearch` server-function call
 * is one ordinary request that does a bounded chunk of work and returns; the
 * client calls it in a loop until the job reaches a terminal status. Closing
 * the tab mid-run loses nothing — the next call to `advanceSearch` picks up
 * exactly where the last one left off, because progress is committed to the
 * row after every candidate, not held in memory.
 *
 * This module is the part of that design that has to be exactly right: the
 * rules for when a job is actually done, and what "done" means when it didn't
 * go perfectly.
 */

import type { SearchPhase, SearchStatus } from "@/lib/domain";

export type JobCounters = {
  candidatesDiscovered: number;
  candidatesProcessed: number;
  errorCount: number;
};

export type JobSnapshot = JobCounters & {
  status: SearchStatus;
  phase: SearchPhase;
  cancelRequested: boolean;
  /** True once discovery has no more pages/queue entries to pull from. */
  discoveryExhausted: boolean;
  /** True once every discovered candidate has left the `queued` state. */
  allCandidatesProcessed: boolean;
};

/**
 * Decide the next phase and status for one chunk.
 *
 * Evaluated at the *start* of `advanceSearch`, before any work — so a
 * cancellation is honoured before the chunk spends a single provider call, and
 * a job that reached a terminal status on the previous chunk is never
 * re-entered.
 */
export type AdvanceDecision =
  | { action: "run"; phase: SearchPhase }
  | { action: "finish"; status: Extract<SearchStatus, "cancelled"> }
  | { action: "noop" };

export function decideNextStep(job: JobSnapshot): AdvanceDecision {
  // Terminal already — nothing to do. Lets the client's polling loop call
  // advanceSearch one extra time without harm.
  if (isTerminalStatus(job.status)) return { action: "noop" };

  // Checked first, before any phase logic: cancellation must win over
  // "there's still discovery to do" or "there's still verification to do".
  if (job.cancelRequested) return { action: "finish", status: "cancelled" };

  if (job.phase === "discover" && !job.discoveryExhausted) {
    return { action: "run", phase: "discover" };
  }
  if (job.phase !== "finalize" && job.phase !== "done" && !job.allCandidatesProcessed) {
    return { action: "run", phase: "verify" };
  }
  if (job.phase !== "done") {
    return { action: "run", phase: "finalize" };
  }
  return { action: "noop" };
}

/**
 * The terminal status for a job that has finished all its work (the
 * `finalize` phase reached with nothing left to do).
 *
 * Every branch here is a judgment call about what "the job is over" should
 * honestly report, not just "did every candidate get a lead":
 *
 *   - Zero candidates and zero errors is success: a genuinely quiet ZIP code
 *     is a valid answer, not a failure.
 *   - Zero candidates WITH errors means the provider never returned anything
 *     usable — that is a failure, and `failed` says so plainly rather than
 *     reporting a misleadingly clean `completed`.
 *   - Errors partway through, with real progress made, is `partially_completed`
 *     — the leads that were found are real and worth keeping, but the run
 *     wasn't clean.
 */
export function decideTerminalStatus(
  counters: JobCounters,
): Extract<SearchStatus, "completed" | "partially_completed" | "failed"> {
  if (counters.candidatesDiscovered === 0) {
    return counters.errorCount > 0 ? "failed" : "completed";
  }
  return counters.errorCount > 0 ? "partially_completed" : "completed";
}

export const TERMINAL_STATUSES: readonly SearchStatus[] = [
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
];

export function isTerminalStatus(status: SearchStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Chunk budgets
// ---------------------------------------------------------------------------

/**
 * Wall-clock budget for one `advanceSearch` call, checked between candidates
 * (never mid-fetch). Comfortably inside a Worker's request window, leaving
 * headroom for the surrounding request/response overhead.
 */
export const CHUNK_WALL_MS = 9_000;

/**
 * Subrequest budget for one chunk. The Workers free plan allows 50 outbound
 * fetches per invocation; each verified candidate can cost up to 6 (find
 * Facebook page, find email, find website candidates, up to 3 verification
 * probes), so the default `chunk_size` of 5 candidates stays comfortably under
 * this even in the worst case.
 */
export const SUBREQUEST_BUDGET = 40;

/** How long a lease is held before another chunk call is allowed to take over. */
export const LEASE_MS = 30_000;

/** Per-candidate retry cap before its row is marked `error` and skipped. */
export const MAX_CANDIDATE_ATTEMPTS = 2;

/**
 * A `running` job whose heartbeat is older than this is presumed abandoned
 * (the driving tab was closed or crashed) and eligible for the sweeper or a
 * user-initiated Resume.
 */
export const STALE_HEARTBEAT_MS = 60_000;

/** How much staleness the scheduled sweeper tolerates before closing a job out. */
export const SWEEP_STALE_MS = 15 * 60_000;

export function isHeartbeatStale(
  heartbeatAt: string | null,
  now: number = Date.now(),
  thresholdMs: number = STALE_HEARTBEAT_MS,
): boolean {
  if (!heartbeatAt) return true;
  const age = now - new Date(heartbeatAt).getTime();
  return age > thresholdMs;
}
