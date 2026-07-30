import { describe, expect, it } from "vitest";

import {
  decideNextStep,
  decideTerminalStatus,
  isHeartbeatStale,
  isTerminalStatus,
  type JobSnapshot,
} from "./job-state";

function job(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    status: "running",
    phase: "discover",
    cancelRequested: false,
    discoveryExhausted: false,
    allCandidatesProcessed: false,
    candidatesDiscovered: 0,
    candidatesProcessed: 0,
    errorCount: 0,
    ...overrides,
  };
}

describe("decideNextStep", () => {
  it("does nothing for an already-terminal job", () => {
    for (const status of ["completed", "partially_completed", "failed", "cancelled"] as const) {
      expect(decideNextStep(job({ status }))).toEqual({ action: "noop" });
    }
  });

  it("cancellation wins over an in-progress discover phase", () => {
    const result = decideNextStep(
      job({ phase: "discover", discoveryExhausted: false, cancelRequested: true }),
    );
    expect(result).toEqual({ action: "finish", status: "cancelled" });
  });

  it("cancellation wins over an in-progress verify phase", () => {
    const result = decideNextStep(
      job({ phase: "verify", allCandidatesProcessed: false, cancelRequested: true }),
    );
    expect(result).toEqual({ action: "finish", status: "cancelled" });
  });

  it("continues discovering while there is more to discover", () => {
    const result = decideNextStep(job({ phase: "discover", discoveryExhausted: false }));
    expect(result).toEqual({ action: "run", phase: "discover" });
  });

  it("moves to verify once discovery is exhausted", () => {
    const result = decideNextStep(
      job({ phase: "discover", discoveryExhausted: true, allCandidatesProcessed: false }),
    );
    expect(result).toEqual({ action: "run", phase: "verify" });
  });

  it("continues verifying while candidates remain queued", () => {
    const result = decideNextStep(
      job({ phase: "verify", discoveryExhausted: true, allCandidatesProcessed: false }),
    );
    expect(result).toEqual({ action: "run", phase: "verify" });
  });

  it("moves to finalize once every candidate is processed", () => {
    const result = decideNextStep(
      job({ phase: "verify", discoveryExhausted: true, allCandidatesProcessed: true }),
    );
    expect(result).toEqual({ action: "run", phase: "finalize" });
  });

  it("does nothing once phase is done", () => {
    const result = decideNextStep(job({ phase: "done", allCandidatesProcessed: true }));
    expect(result).toEqual({ action: "noop" });
  });

  it("never leaves discovery early just because verify looks ready", () => {
    // A job can't jump to verify while discovery still has pages left, even if
    // (implausibly) allCandidatesProcessed were already true for what HAS been
    // discovered so far.
    const result = decideNextStep(
      job({ phase: "discover", discoveryExhausted: false, allCandidatesProcessed: true }),
    );
    expect(result).toEqual({ action: "run", phase: "discover" });
  });
});

describe("decideTerminalStatus", () => {
  it("is completed for a clean run with results", () => {
    expect(
      decideTerminalStatus({ candidatesDiscovered: 12, candidatesProcessed: 12, errorCount: 0 }),
    ).toBe("completed");
  });

  it("is completed for a genuinely quiet search — zero results is a valid answer", () => {
    expect(
      decideTerminalStatus({ candidatesDiscovered: 0, candidatesProcessed: 0, errorCount: 0 }),
    ).toBe("completed");
  });

  it("is failed when nothing was ever discovered AND errors occurred", () => {
    // Distinguishes "the ZIP code is quiet" from "the provider never worked" —
    // reporting the second case as a clean completed would hide a real problem.
    expect(
      decideTerminalStatus({ candidatesDiscovered: 0, candidatesProcessed: 0, errorCount: 3 }),
    ).toBe("failed");
  });

  it("is partially_completed when some candidates errored but progress was made", () => {
    expect(
      decideTerminalStatus({ candidatesDiscovered: 20, candidatesProcessed: 17, errorCount: 3 }),
    ).toBe("partially_completed");
  });
});

describe("isTerminalStatus", () => {
  it("classifies every status correctly", () => {
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("partially_completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
  });
});

describe("isHeartbeatStale", () => {
  const now = new Date("2026-08-01T12:00:00Z").getTime();

  it("treats a null heartbeat as stale", () => {
    expect(isHeartbeatStale(null, now)).toBe(true);
  });

  it("is fresh just under the threshold", () => {
    const heartbeat = new Date(now - 59_000).toISOString();
    expect(isHeartbeatStale(heartbeat, now)).toBe(false);
  });

  it("is stale just over the threshold", () => {
    const heartbeat = new Date(now - 61_000).toISOString();
    expect(isHeartbeatStale(heartbeat, now)).toBe(true);
  });

  it("accepts a custom threshold for the sweeper's longer tolerance", () => {
    const heartbeat = new Date(now - 10 * 60_000).toISOString();
    expect(isHeartbeatStale(heartbeat, now, 15 * 60_000)).toBe(false);
    expect(isHeartbeatStale(heartbeat, now, 5 * 60_000)).toBe(true);
  });
});
