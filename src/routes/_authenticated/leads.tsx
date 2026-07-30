import { createFileRoute } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Saved Leads"
        description="Every lead found or imported, with its website-verification status."
      />
      <EmptyState
        icon={Bookmark}
        title="Leads table coming in phase 6"
        description="Sorting, filtering, bulk actions and exports all hang off this page."
      />
    </>
  );
}
