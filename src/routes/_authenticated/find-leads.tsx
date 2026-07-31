import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { SearchModeTabs } from "@/components/search/SearchModeTabs";
import { JobProgress } from "@/components/search/JobProgress";
import { SearchResultsList } from "@/components/leads/SearchResultsList";
import { useSearchJob } from "@/hooks/use-search-job";
import { startSearch } from "@/lib/searches.functions";
import { exportLeads } from "@/lib/export.functions";
import type { SearchCriteria } from "@/lib/search-criteria";
import type { ExportFormat } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/find-leads")({
  component: FindLeadsPage,
});

function FindLeadsPage() {
  const [searchId, setSearchId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const job = useSearchJob(searchId);

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
        description="Search by ZIP code, telephone area code, or state and county. Results are checked for a Facebook page and an independent website."
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
        <SearchModeTabs busy={starting || job.running} onSubmit={handleSubmit} />

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
