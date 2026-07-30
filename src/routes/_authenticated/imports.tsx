import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { ImportWizard } from "@/components/imports/ImportWizard";
import { listImports } from "@/lib/import.functions";

export const Route = createFileRoute("/_authenticated/imports")({
  component: ImportsPage,
});

type ImportRow = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  created_at: string;
};

function ImportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: () => listImports({ data: { page: 1, pageSize: 10 } }),
  });

  const rows = (data?.rows ?? []) as ImportRow[];

  return (
    <>
      <PageHeader
        title="Imports"
        description="Bring in leads from a CSV or XLSX file, then check them for websites."
      />

      <div className="space-y-6">
        <ImportWizard />

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent imports</h2>
          {isLoading ? (
            <LoadingBlock rows={3} label="Loading import history" />
          ) : rows.length === 0 ? (
            <EmptyState icon={History} title="No imports yet" />
          ) : (
            <div className="table-scroll rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      File
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Rows
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Imported
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Updated
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Skipped
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Errors
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium">{row.filename}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{row.status}</td>
                      <td className="px-3 py-2 tabular-nums">{row.total_rows}</td>
                      <td className="px-3 py-2 tabular-nums">{row.imported_rows}</td>
                      <td className="px-3 py-2 tabular-nums">{row.updated_rows}</td>
                      <td className="px-3 py-2 tabular-nums">{row.skipped_rows}</td>
                      <td className="px-3 py-2 tabular-nums">{row.error_rows}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
