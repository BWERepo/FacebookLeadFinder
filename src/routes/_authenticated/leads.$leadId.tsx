import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { QualifiedBadge, WebsiteStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  addLeadNote,
  deleteLeadNote,
  deleteLeads,
  getLead,
  updateLeadFields,
} from "@/lib/leads.functions";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/domain";
import type { LeadStatus } from "@/lib/domain";
import { isSafeExternalUrl } from "@/lib/url";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  component: LeadDetailsPage,
});

function LeadDetailsPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => getLead({ data: { leadId } }),
  });

  async function refetch() {
    await qc.invalidateQueries({ queryKey: ["lead", leadId] });
  }

  async function handleStatusChange(leadStatus: LeadStatus) {
    try {
      await updateLeadFields({ data: { leadId, leadStatus } });
      toast.success("Status updated");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update status.");
    }
  }

  async function handleAddNote() {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await addLeadNote({ data: { leadId, body: noteBody.trim() } });
      setNoteBody("");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await deleteLeadNote({ data: { noteId } });
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete note.");
    }
  }

  async function handleDeleteLead() {
    setDeleting(true);
    try {
      await deleteLeads({ data: { leadIds: [leadId] } });
      toast.success("Lead deleted");
      navigate({ to: "/leads" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete lead.");
      setDeleting(false);
    }
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Lead" />
        <LoadingBlock rows={6} label="Loading lead" />
      </>
    );
  }

  const { lead, notes, activities } = data;

  return (
    <>
      <PageHeader
        title={lead.business_name}
        description={[lead.city, lead.state, lead.zip].filter(Boolean).join(", ")}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leads">
                <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
                Back to Saved Leads
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 size-4" aria-hidden="true" />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <WebsiteStatusBadge status={lead.website_status} />
                <QualifiedBadge qualified={lead.qualified} />
                <span className="text-sm tabular-nums text-muted-foreground">
                  Confidence: {lead.confidence_score}
                </span>
              </div>
              {lead.verification_notes ? (
                <p className="text-sm text-muted-foreground">{lead.verification_notes}</p>
              ) : null}
              {Array.isArray(lead.sources) && lead.sources.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sources
                  </p>
                  <ul className="space-y-1 text-sm">
                    {(lead.sources as Array<{ source: string; url: string }>).map((s, i) => (
                      <li key={i}>
                        {isSafeExternalUrl(s.url) ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {s.source} <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span>{s.source}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" value={lead.phone || "—"} />
              <Field label="Email" value={lead.email ?? "Not Found"} />
              <Field
                label="Page"
                value={
                  lead.facebook_url && isSafeExternalUrl(lead.facebook_url) ? (
                    <a
                      href={lead.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View page <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="Address" value={lead.address || "—"} />
              <Field label="Category" value={lead.category || "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add a note…"
                  rows={2}
                  className="flex-1"
                />
                <Button onClick={handleAddNote} disabled={savingNote || !noteBody.trim()}>
                  Add
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((note: { id: string; body: string; created_at: string }) => (
                    <li key={note.id} className="rounded-md border p-3 text-sm">
                      <p className="whitespace-pre-wrap">{note.body}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                        <button
                          type="button"
                          className="hover:text-destructive"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={lead.lead_status}
                  onValueChange={(v) => handleStatusChange(v as LeadStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="First found"
                value={new Date(lead.first_found_at).toLocaleDateString()}
              />
              <Field
                label="Last checked"
                value={
                  lead.last_checked_at ? new Date(lead.last_checked_at).toLocaleDateString() : "—"
                }
              />
              {lead.archived_at ? (
                <Field label="Archived" value={new Date(lead.archived_at).toLocaleDateString()} />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {activities.map(
                    (
                      activity: { id: string; description: string; created_at: string },
                      i: number,
                    ) => (
                      <li key={activity.id}>
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleString()}
                        </p>
                        {i < activities.length - 1 ? <Separator className="mt-3" /> : null}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {lead.business_name}, including its notes. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDeleteLead}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
}
