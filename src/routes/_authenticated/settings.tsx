import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Search provider, excluded domains, categories and export preferences."
      />
      <EmptyState
        icon={SettingsIcon}
        title="Settings coming in phase 11"
        description="API credentials are Worker secrets — this page only ever shows whether one is configured."
      />
    </>
  );
}
