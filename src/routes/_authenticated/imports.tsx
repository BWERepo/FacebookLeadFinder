import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/imports")({
  component: ImportsPage,
});

function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Imports"
        description="Bring in leads from a CSV or XLSX file, then check them for websites."
      />
      <EmptyState
        icon={Upload}
        title="Import wizard coming in phase 10"
        description="Preview, column mapping, validation, duplicate handling and a summary."
      />
    </>
  );
}
