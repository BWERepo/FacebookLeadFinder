/**
 * Drives a search job by calling `advanceSearch` in a loop until it reaches a
 * terminal status.
 *
 * Sequential, never parallel: awaiting each chunk before firing the next means
 * this hook's own calls can never contend with each other for the job's
 * lease. An `AbortController` stops the loop on unmount, so navigating away
 * mid-search doesn't leak a runaway chain of requests — the job itself is
 * unaffected and can be resumed later from Search History.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { advanceSearch, cancelSearch, type SearchProgress } from "@/lib/searches.functions";

const TERMINAL = new Set(["completed", "partially_completed", "failed", "cancelled"]);

export type SearchJobState = {
  progress: SearchProgress | null;
  running: boolean;
  error: string | null;
};

export function useSearchJob(searchId: string | null) {
  const [state, setState] = useState<SearchJobState>({
    progress: null,
    running: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ progress: null, running: true, error: null });

    try {
      let done = false;
      while (!done && !controller.signal.aborted) {
        const progress = await advanceSearch({ data: { searchId: id } });
        if (controller.signal.aborted) return;
        setState({ progress, running: !TERMINAL.has(progress.status), error: null });
        done = TERMINAL.has(progress.status);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((prev) => ({
        ...prev,
        running: false,
        error: error instanceof Error ? error.message : "The search stopped unexpectedly.",
      }));
    }
  }, []);

  useEffect(() => {
    if (searchId) run(searchId);
    return () => abortRef.current?.abort();
  }, [searchId, run]);

  const cancel = useCallback(async () => {
    if (!searchId) return;
    await cancelSearch({ data: { searchId } });
    // The running loop's next chunk will see cancel_requested and stop on its
    // own; no need to abort the loop here — it needs to make one more
    // advanceSearch call to observe and report the cancellation.
  }, [searchId]);

  const resume = useCallback(() => {
    if (searchId) run(searchId);
  }, [searchId, run]);

  return { ...state, cancel, resume };
}
