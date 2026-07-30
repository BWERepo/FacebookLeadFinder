import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SearchModeTabs } from "@/components/search/SearchModeTabs";
import { JobProgress } from "@/components/search/JobProgress";
import { SearchResultsList } from "@/components/leads/SearchResultsList";
import { useSearchJob } from "@/hooks/use-search-job";
import { startSearch } from "@/lib/searches.functions";
import type { SearchCriteria } from "@/lib/search-criteria";

export const Route = createFileRoute("/_authenticated/find-leads")({
  component: FindLeadsPage,
});

function FindLeadsPage() {
  const [searchId, setSearchId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
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

  return (
    <>
      <PageHeader
        title="Find Leads"
        description="Search by ZIP code, telephone area code, or state and county. Results are checked for a Facebook page and an independent website."
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
