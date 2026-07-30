import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { QualifiedBadge, WebsiteStatusBadge, LeadStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveLeads, deleteLeads, listLeads, unarchiveLeads } from "@/lib/leads.functions";
import { getDemoDataStatus, loadDemoData, removeDemoData } from "@/lib/demo-data.functions";
import { exportLeads } from "@/lib/export.functions";
import type { ExportFormat } from "@/lib/domain";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  WEBSITE_STATUSES,
  WEBSITE_STATUS_LABELS,
} from "@/lib/domain";
import type { LeadStatus, WebsiteStatus } from "@/lib/domain";
import { isSafeExternalUrl } from "@/lib/url";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

type LeadRow = {
  id: string;
  business_name: string;
  category: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string | null;
  facebook_url: string | null;
  website_status: WebsiteStatus;
  qualified: boolean;
  confidence_score: number;
  lead_status: LeadStatus;
  next_followup_date: string | null;
  archived_at: string | null;
};

type ArchivedFilter = "active" | "archived" | "all";
type SortBy =
  "created_at" | "business_name" | "confidence_score" | "lead_status" | "next_followup_date";

const PAGE_SIZE = 25;
const ALL = "__all__";

function LeadsPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus | "">("");
  const [websiteStatus, setWebsiteStatus] = useState<WebsiteStatus | "">("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: demoStatus } = useQuery({
    queryKey: ["demo-data-status"],
    queryFn: () => getDemoDataStatus(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["leads", { search, leadStatus, websiteStatus, archived, sortBy, sortDir, page }],
    queryFn: () =>
      listLeads({
        data: {
          page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          leadStatus: leadStatus || undefined,
          websiteStatus: websiteStatus || undefined,
          archived,
          sortBy,
          sortDir,
        },
      }),
  });

  const rows = (data?.rows ?? []) as LeadRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedIds = Array.from(selected);

  function resetToFirstPage() {
    setPage(1);
    setSelected(new Set());
  }

  function toggleSort(column: SortBy) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "business_name" ? "asc" : "desc");
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allSelected) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function refetch() {
    await qc.invalidateQueries({ queryKey: ["leads"] });
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await archiveLeads({ data: { leadIds: selectedIds } });
      toast.success(`${selectedIds.length} lead(s) archived`);
      setSelected(new Set());
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive leads.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnarchive() {
    setBusy(true);
    try {
      await unarchiveLeads({ data: { leadIds: selectedIds } });
      toast.success(`${selectedIds.length} lead(s) unarchived`);
      setSelected(new Set());
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unarchive leads.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteLeads({ data: { leadIds: selectedIds } });
      toast.success(`${selectedIds.length} lead(s) deleted`);
      setSelected(new Set());
      setConfirmDelete(false);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete leads.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadDemoData() {
    setDemoBusy(true);
    try {
      const result = await loadDemoData();
      toast.success(`Loaded ${result.count} demo leads`);
      await qc.invalidateQueries({ queryKey: ["demo-data-status"] });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load demo data.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleRemoveDemoData() {
    setDemoBusy(true);
    try {
      const result = await removeDemoData();
      toast.success(`Removed ${result.count} demo leads`);
      await qc.invalidateQueries({ queryKey: ["demo-data-status"] });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove demo data.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleExport(format: ExportFormat) {
    setExporting(true);
    try {
      const result = await exportLeads({
        data: {
          format,
          search: search || undefined,
          leadStatus: leadStatus || undefined,
          websiteStatus: websiteStatus || undefined,
          archived,
        },
      });
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

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <PageHeader
        title="Saved Leads"
        description="Every lead found or imported, with its website-verification status."
        actions={
          <>
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
                  Export as XLSX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {demoStatus?.loaded ? (
              <Button
                size="sm"
                variant="outline"
                disabled={demoBusy}
                onClick={handleRemoveDemoData}
              >
                Remove demo data
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={demoBusy} onClick={handleLoadDemoData}>
                Load demo data
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, phone, email, city…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage();
          }}
          className="w-64"
        />

        <Select
          value={leadStatus || ALL}
          onValueChange={(v) => {
            setLeadStatus(v === ALL ? "" : (v as LeadStatus));
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Pipeline status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={websiteStatus || ALL}
          onValueChange={(v) => {
            setWebsiteStatus(v === ALL ? "" : (v as WebsiteStatus));
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Website status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All website statuses</SelectItem>
            {WEBSITE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {WEBSITE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={archived}
          onValueChange={(v) => {
            setArchived(v as ArchivedFilter);
            resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {selectedIds.length > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            {archived === "archived" ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleUnarchive}>
                <ArchiveRestore className="mr-1.5 size-4" aria-hidden="true" />
                Unarchive
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleArchive}>
                <Archive className="mr-1.5 size-4" aria-hidden="true" />
                Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingBlock rows={6} label="Loading leads" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No leads match these filters"
          description="Run a search from Find Leads, or adjust the filters above."
        />
      ) : (
        <>
          <div className="table-scroll rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Saved leads</caption>
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Select all leads on this page"
                    />
                  </th>
                  <SortableHeader
                    label="Business"
                    column="business_name"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th scope="col" className="px-3 py-2 font-medium">
                    Location
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Facebook
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Website status
                  </th>
                  <SortableHeader
                    label="Confidence"
                    column="confidence_score"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Pipeline"
                    column="lead_status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Follow-up"
                    column="next_followup_date"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggleRow(lead.id)}
                        aria-label={`Select ${lead.business_name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="font-medium hover:underline"
                      >
                        {lead.business_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{lead.category}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lead.city}, {lead.state} {lead.zip}
                    </td>
                    <td className="px-3 py-2">
                      {lead.facebook_url && isSafeExternalUrl(lead.facebook_url) ? (
                        <a
                          href={lead.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Page
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <WebsiteStatusBadge status={lead.website_status} />
                        <QualifiedBadge qualified={lead.qualified} />
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{lead.confidence_score}</td>
                    <td className="px-3 py-2">
                      <LeadStatusBadge status={lead.lead_status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {lead.next_followup_date ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} lead{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setSelected(new Set());
                }}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelected(new Set());
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} lead(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected lead(s), including their notes. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortBy;
  sortBy: SortBy;
  sortDir: "asc" | "desc";
  onSort: (column: SortBy) => void;
}) {
  const active = sortBy === column;
  return (
    <th scope="col" className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="size-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3" aria-hidden="true" />
          )
        ) : null}
      </button>
    </th>
  );
}
