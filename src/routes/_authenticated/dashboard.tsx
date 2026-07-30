import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Qualified leads at a glance, plus what's been found recently."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard coming in phase 8"
        description="Stat cards and charts land once the search pipeline and leads table are in place."
      />
    </>
  );
}
