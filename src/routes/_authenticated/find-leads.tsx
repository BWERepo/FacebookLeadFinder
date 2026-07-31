import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingBlock } from "@/components/LoadingBlock";
import { SearchModeTabs } from "@/components/search/SearchModeTabs";
import { JobProgress } from "@/components/search/JobProgress";
import { SearchResultsList } from "@/components/leads/SearchResultsList";
import { useSearchJob } from "@/hooks/use-search-job";
import { startSearch } from "@/lib/searches.functions";
import { exportLeads } from "@/lib/export.functions";
import { getSettings } from "@/lib/settings.functions";
import type { SearchCriteria } from "@/lib/search-criteria";
import type { ExportFormat } from "@/lib/domain";

type FindLeadsSearch = { searchId?: string };

export const Route = createFileRoute("/_authenticated/find-leads")({
  validateSearch: (search: Record<string, unknown>): FindLeadsSearch => ({
    searchId: typeof search.searchId === "string" ? search.searchId : undefined,
  }),
  component: FindLeadsPage,
});

function FindLeadsPage() {
  // Kept in the URL (not just component state) so a running or just-finished
  // search survives leaving this page and coming back, or a refresh — the
  // whole point being that "no visibility on running searches" bug this
  // fixes. useSearchJob already resumes a job that's still pending/running
  // when handed its id, so this "just" wires that existing capability up to
  // actually persist across navigation.
  const { searchId: routeSearchId } = Route.useSearch();
  const navigate = useNavigate();
  const [searchId, setSearchIdState] = useState<string | null>(routeSearchId ?? null);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const job = useSearchJob(searchId);

  function setSearchId(id: string | null) {
    setSearchIdState(id);
    navigate({
      to: "/find-leads",
      search: id ? { searchId: id } : {},
      replace: true,
    });
  }

  // Same queryKey settings.tsx uses, so this shares its cache rather than
  // firing a second request. The forms need this loaded before they mount so
  // their maxResults field starts at the user's actual default, not a
  // hardcoded fallback that briefly shows then jumps.
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });
  const defaultMaxResults = settingsData?.settings.default_max_results ?? 100;
  const defaultRadiusMiles = settingsData?.settings.default_radius_miles ?? 10;

  async function handleSubmit(criteria: SearchCriteria) {
    setStarting(true);
    try {
      const { searchId: id } = await startSearch({ data: criteria });
      setSearchId(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the search.");
    } finally {
      setStarting(false);
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!searchId) return;
    setExporting(true);
    try {
      const result = await exportLeads({ data: { format, searchId } });
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} lead(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export leads.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Find Leads"
        description="Search by ZIP code, telephone area code, or state and county. Results are checked for a linked business page and an independent website."
        actions={
          searchId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={exporting}>
                  <Download className="mr-1.5 size-4" aria-hidden="true" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                  Export as XLSX (with hyperlinks)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <div className="space-y-6">
        {settingsLoading ? (
          <LoadingBlock rows={4} label="Loading search form" />
        ) : (
          <SearchModeTabs
            busy={starting || job.running}
            onSubmit={handleSubmit}
            defaultMaxResults={defaultMaxResults}
            defaultRadiusMiles={defaultRadiusMiles}
          />
        )}

        {searchId ? (
          <>
            <JobProgress state={job} onCancel={job.cancel} onResume={job.resume} />
            <SearchResultsList searchId={searchId} />
          </>
        ) : null}
      </div>
    </>
  );
}
