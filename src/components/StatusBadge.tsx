import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_BAND_LABELS,
  LEAD_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
  type ConfidenceBand,
  type LeadStatus,
  type WebsiteStatus,
} from "@/lib/domain";

/**
 * Consistent status badges, used everywhere a website-verification status,
 * pipeline status, or confidence band is shown — the results table, the leads
 * table, and the lead details page all render the exact same badge for the
 * exact same status, so a color never means two different things.
 */

const WEBSITE_STATUS_STYLES: Record<WebsiteStatus, string> = {
  no_website_found: "bg-status-qualified-bg text-status-qualified",
  facebook_only: "bg-status-qualified-bg text-status-qualified",
  website_found: "bg-status-has-site-bg text-status-has-site",
  needs_manual_review: "bg-status-review-bg text-status-review",
  unable_to_verify: "bg-status-unknown-bg text-status-unknown",
};

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", WEBSITE_STATUS_STYLES[status])}
    >
      {WEBSITE_STATUS_LABELS[status]}
    </Badge>
  );
}

const CONFIDENCE_STYLES: Record<ConfidenceBand, string> = {
  high: "bg-status-qualified-bg text-status-qualified",
  medium: "bg-status-review-bg text-status-review",
  manual: "bg-status-unknown-bg text-status-unknown",
};

export function ConfidenceBadge({ score, band }: { score: number; band: ConfidenceBand }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium tabular-nums", CONFIDENCE_STYLES[band])}
    >
      {score} · {CONFIDENCE_BAND_LABELS[band]}
    </Badge>
  );
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant="secondary" className="font-medium">
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}

export function QualifiedBadge({ qualified }: { qualified: boolean }) {
  if (!qualified) return null;
  return (
    <Badge className="border-transparent bg-status-qualified-bg font-medium text-status-qualified">
      Qualified
    </Badge>
  );
}
