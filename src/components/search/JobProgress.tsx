import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SearchJobState } from "@/hooks/use-search-job";

/** "1h 04m 12s" / "4m 05s" / "12s", trimming leading zero units. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${String(minutes).padStart(hours > 0 ? 2 : 1, "0")}m`);
  parts.push(`${String(seconds).padStart(minutes > 0 || hours > 0 ? 2 : 1, "0")}s`);
  return parts.join(" ");
}

/** Ticks once a second while `active`, so elapsed time stays live during a running search. */
function useElapsed(
  startedAt: string | null,
  endedAt: string | null,
  active: boolean,
): string | null {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!startedAt) return null;
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return formatElapsed(end - new Date(startedAt).getTime());
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Starting…",
  running: "Searching…",
  completed: "Completed",
  partially_completed: "Partially completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 className="size-5 text-status-qualified" aria-hidden="true" />;
  if (status === "failed")
    return <XCircle className="size-5 text-destructive" aria-hidden="true" />;
  if (status === "cancelled" || status === "partially_completed")
    return <TriangleAlert className="size-5 text-status-review" aria-hidden="true" />;
  return <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />;
}

export function JobProgress({
  state,
  onCancel,
  onResume,
}: {
  state: SearchJobState;
  onCancel: () => void;
  onResume: () => void;
}) {
  const { progress, running, error } = state;
  // Called unconditionally, before the early return below — Rules of Hooks.
  const elapsed = useElapsed(progress?.startedAt ?? null, progress?.endedAt ?? null, running);

  if (!progress && !error) return null;

  const percent =
    progress && progress.candidatesDiscovered > 0
      ? Math.round((progress.candidatesProcessed / progress.candidatesDiscovered) * 100)
      : progress?.status === "running" || progress?.status === "pending"
        ? undefined // indeterminate while still discovering
        : 0;

  return (
    <div className="rounded-lg border p-4" role="status" aria-live="polite" aria-busy={running}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {progress ? (
            <StatusIcon status={progress.status} />
          ) : (
            <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
          )}
          <span className="text-sm font-medium">
            {progress ? (STATUS_LABEL[progress.status] ?? progress.status) : "Search stopped"}
          </span>
        </div>
        {running ? (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : progress && progress.status === "running" ? (
          <Button variant="outline" size="sm" onClick={onResume}>
            Resume
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : progress ? (
        <>
          <Progress value={percent ?? undefined} className="mt-3" />
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Stat label="Discovered" value={progress.candidatesDiscovered} />
            <Stat label="Sites searched" value={progress.candidatesProcessed} />
            <Stat label="Pages found" value={progress.facebookPagesFound} />
            <Stat label="Websites checked" value={progress.websitesChecked} />
            <Stat label="Qualified" value={progress.qualifiedFound} emphasize />
            {elapsed !== null ? <Stat label="Elapsed" value={elapsed} /> : null}
          </dl>
          {progress.notes.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {progress.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}
          {progress.errorCount > 0 ? (
            <p className="mt-2 text-xs text-status-review">
              {progress.errorCount} candidate{progress.errorCount === 1 ? "" : "s"} could not be
              checked{progress.lastError ? `: ${progress.lastError}` : "."}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number | string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasize ? "font-semibold text-status-qualified" : "font-medium"}>{value}</dd>
    </div>
  );
}
