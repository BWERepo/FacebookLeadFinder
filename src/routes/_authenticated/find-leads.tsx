import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/find-leads")({
  component: FindLeadsPage,
});

function FindLeadsPage() {
  return (
    <>
      <PageHeader
        title="Find Leads"
        description="Search by ZIP code, telephone area code, or state and county."
      />
      <EmptyState
        icon={Search}
        title="Search forms coming in phase 5"
        description="The three search modes are wired up alongside the job engine and mock provider."
      />
    </>
  );
}
