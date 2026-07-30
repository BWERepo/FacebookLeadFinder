import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Inline error for a failed query. Shows the server function's user-safe
 * message when there is one; never renders a raw stack trace.
 */
export function ErrorNotice({
  title = "Couldn't load this",
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error && error.message && error.message.length < 200
      ? error.message
      : "Something went wrong. Try again in a moment.";

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center"
    >
      <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
