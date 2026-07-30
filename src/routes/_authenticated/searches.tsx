import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/searches")({
  component: SearchesPage,
});

function SearchesPage() {
  return (
    <>
      <PageHeader
        title="Search History"
        description="Every search that has been run, with its candidate and qualified counts."
      />
      <EmptyState
        icon={History}
        title="Search history coming in phase 5"
        description="Each search is a durable job row, so history and resume share the same record."
      />
    </>
  );
}
