import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { QualifiedBadge, WebsiteStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { listLeadsForSearch } from "@/lib/leads.functions";
import { isSafeExternalUrl } from "@/lib/url";
import type { WebsiteStatus } from "@/lib/domain";

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
};

/**
 * A lightweight preview of the leads a running (or just-finished) search has
 * produced so far, shown on the Find Leads page itself. The full sortable,
 * filterable table with bulk actions lives on the Saved Leads page (Phase 6).
 */
export function SearchResultsList({ searchId }: { searchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["search-results", searchId],
    queryFn: () => listLeadsForSearch({ data: { searchId } }),
    // Poll while a search is likely still running; harmless once it's done.
    refetchInterval: 3000,
  });

  const leads = (data ?? []) as LeadRow[];

  if (isLoading && leads.length === 0) return <LoadingBlock rows={3} label="Loading results" />;
  if (leads.length === 0) {
    return (
      <EmptyState title="No leads yet" description="Results will appear here as the search runs." />
    );
  }

  return (
    <div className="table-scroll rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Leads found by this search</caption>
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Business
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Location
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Facebook
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Website status
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td className="px-3 py-2">
                <div className="font-medium">{lead.business_name}</div>
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
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Page <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {lead.email ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1 size-6"
                    aria-label="Copy email"
                    onClick={() => {
                      navigator.clipboard.writeText(lead.email!);
                      toast.success("Email copied");
                    }}
                  >
                    <Copy className="size-3" aria-hidden="true" />
                  </Button>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <WebsiteStatusBadge status={lead.website_status} />
                  <QualifiedBadge qualified={lead.qualified} />
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">{lead.confidence_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
