import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { StatusIcon, STATUS_LABEL } from "@/components/search/JobProgress";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cancelSearch, deleteSearch, listSearches, repeatSearch } from "@/lib/searches.functions";
import { describeCriteria, searchCriteriaSchema } from "@/lib/search-criteria";

export const Route = createFileRoute("/_authenticated/searches")({
  component: SearchesPage,
});

const RUNNING_STATUSES = new Set(["pending", "running"]);
const PAGE_SIZE = 20;

type SearchRow = {
  id: string;
  status: string;
  criteria: unknown;
  candidates_discovered: number;
  qualified_found: number;
  created_at: string;
};

function SearchesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["searches-history", page],
    queryFn: () => listSearches({ data: { page, pageSize: PAGE_SIZE } }),
    // Cheap enough at this volume, and it's the only way this page's own
    // "still running" rows update without a manual refresh.
    refetchInterval: 5000,
  });

  const rows = (data?.rows ?? []) as SearchRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function refetch() {
    await qc.invalidateQueries({ queryKey: ["searches-history"] });
  }

  async function handleCancel(id: string) {
    setBusyId(id);
    try {
      await cancelSearch({ data: { searchId: id } });
      toast.success("Cancellation requested — it'll stop at its next check-in.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the search.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteSearch({ data: { searchId: id } });
      toast.success("Search deleted");
      setConfirmDeleteId(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the search.");
    } finally {
      setBusyId(null);
    }
  }

  function describe(criteria: unknown): string {
    const parsed = searchCriteriaSchema.safeParse(criteria);
    return parsed.success ? describeCriteria(parsed.data) : "Unknown criteria";
  }

  return (
    <>
      <PageHeader
        title="Search History"
        description="Every search that has been run, with its candidate and qualified counts."
      />

      {isLoading ? (
        <LoadingBlock rows={6} label="Loading search history" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No searches yet"
          description="Run a search from Find Leads to see it show up here."
        />
      ) : (
        <>
          <div className="table-scroll rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Search history</caption>
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Criteria
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Discovered
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Qualified
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Started
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const running = RUNNING_STATUSES.has(row.status);
                  return (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/find-leads"
                          search={{ searchId: row.id }}
                          className="font-medium hover:underline"
                        >
                          {describe(row.criteria)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={row.status} />
                          <span>{STATUS_LABEL[row.status] ?? row.status}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.candidates_discovered}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-status-qualified">
                        {row.qualified_found}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {running ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.id}
                              onClick={() => handleCancel(row.id)}
                            >
                              Cancel
                            </Button>
                          ) : (
                            <RepeatButton
                              searchId={row.id}
                              disabled={busyId === row.id}
                              onBusy={setBusyId}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.id}
                            aria-label="Delete search"
                            onClick={() => setConfirmDeleteId(row.id)}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} search{total === 1 ? "" : "es"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this search?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the search job and its history. Leads it already found stay in Saved
              Leads — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Separate component so its own navigate() call has the right hook scope. */
function RepeatButton({
  searchId,
  disabled,
  onBusy,
}: {
  searchId: string;
  disabled: boolean;
  onBusy: (id: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      onClick={async () => {
        setPending(true);
        onBusy(searchId);
        try {
          const { searchId: newId } = await repeatSearch({ data: { searchId } });
          navigate({ to: "/find-leads", search: { searchId: newId } });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not repeat the search.");
        } finally {
          setPending(false);
          onBusy(null);
        }
      }}
    >
      Repeat
    </Button>
  );
}
