/**
 * The application's closed vocabularies.
 *
 * Each set is declared once here as a `const` array, and both the TypeScript
 * union and the UI's display label are derived from it. `src/integrations/
 * supabase/types.ts` imports the unions rather than re-declaring them.
 *
 * These arrays exist at runtime on purpose: `domain.test.ts` reads the SQL in
 * supabase/migrations/ and asserts that every CHECK (... IN (...)) constraint
 * matches the array here. Migrations in this project are applied by hand in the
 * hosted SQL editor, so a mismatch between the schema and the types would
 * otherwise typecheck clean and only fail in production, as a constraint
 * violation, on a code path nobody exercised.
 */

// --- roles -----------------------------------------------------------------

export const APP_ROLES = ["admin", "member"] as const;
export type AppRole = (typeof APP_ROLES)[number];

// --- website verification --------------------------------------------------

export const WEBSITE_STATUSES = [
  "no_website_found",
  "website_found",
  "facebook_only",
  "needs_manual_review",
  "unable_to_verify",
] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  no_website_found: "No Website Found",
  website_found: "Website Found",
  facebook_only: "Facebook Only",
  needs_manual_review: "Needs Manual Review",
  unable_to_verify: "Unable to Verify",
};

/**
 * The two statuses that can qualify a lead.
 *
 * Qualification also requires a confirmed Facebook page — see
 * `classifyWebsite` in verification.ts, and the CHECK constraint on
 * public.leads. Membership of this list is necessary, not sufficient.
 */
export const QUALIFYING_WEBSITE_STATUSES = [
  "no_website_found",
  "facebook_only",
] as const satisfies readonly WebsiteStatus[];

export function isQualifyingStatus(status: WebsiteStatus): boolean {
  return (QUALIFYING_WEBSITE_STATUSES as readonly WebsiteStatus[]).includes(status);
}

// --- email discovery -------------------------------------------------------

export const EMAIL_STATUSES = ["verified", "publicly_listed", "unverified", "not_found"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  verified: "Verified",
  publicly_listed: "Publicly Listed",
  unverified: "Unverified",
  not_found: "Not Found",
};

// --- confidence ------------------------------------------------------------

export const CONFIDENCE_BANDS = ["high", "medium", "manual"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  manual: "Manual review required",
};

/** Score thresholds. 80+ high, 60-79 medium, below 60 needs a human. */
export const CONFIDENCE_HIGH_MIN = 80;
export const CONFIDENCE_MEDIUM_MIN = 60;

export function confidenceBandFor(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_HIGH_MIN) return "high";
  if (score >= CONFIDENCE_MEDIUM_MIN) return "medium";
  return "manual";
}

// --- lead pipeline ---------------------------------------------------------

export const LEAD_STATUSES = [
  "new",
  "not_contacted",
  "contacted",
  "responded",
  "interested",
  "prototype_offered",
  "prototype_created",
  "proposal_sent",
  "customer",
  "not_interested",
  "do_not_contact",
  "archived",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  responded: "Responded",
  interested: "Interested",
  prototype_offered: "Prototype Offered",
  prototype_created: "Prototype Created",
  proposal_sent: "Proposal Sent",
  customer: "Customer",
  not_interested: "Not Interested",
  do_not_contact: "Do Not Contact",
  archived: "Archived",
};

// --- searches --------------------------------------------------------------

export const SEARCH_TYPES = ["zip_radius", "area_code", "state_county"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  zip_radius: "ZIP code",
  area_code: "Area code",
  state_county: "State & county",
};

export const SEARCH_STATUSES = [
  "pending",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export const SEARCH_STATUS_LABELS: Record<SearchStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  partially_completed: "Partially Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Statuses a job never leaves. The client's advance loop stops on these. */
export const TERMINAL_SEARCH_STATUSES = [
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const satisfies readonly SearchStatus[];

export function isTerminalSearchStatus(status: SearchStatus): boolean {
  return (TERMINAL_SEARCH_STATUSES as readonly SearchStatus[]).includes(status);
}

export const SEARCH_PHASES = ["discover", "verify", "finalize", "done"] as const;
export type SearchPhase = (typeof SEARCH_PHASES)[number];

export const PROCESSING_STATES = ["queued", "processing", "processed", "skipped", "error"] as const;
export type ProcessingState = (typeof PROCESSING_STATES)[number];

// --- duplicates ------------------------------------------------------------

export const DUPLICATE_CERTAINTIES = ["certain", "probable", "possible"] as const;
export type DuplicateCertainty = (typeof DUPLICATE_CERTAINTIES)[number];

// --- excluded domains ------------------------------------------------------

export const EXCLUDED_DOMAIN_KINDS = [
  "facebook",
  "other_social",
  "directory",
  "marketplace",
  "google_business",
  "other",
] as const;
export type ExcludedDomainKind = (typeof EXCLUDED_DOMAIN_KINDS)[number];

export const EXCLUDED_DOMAIN_KIND_LABELS: Record<ExcludedDomainKind, string> = {
  facebook: "Facebook",
  other_social: "Social media",
  directory: "Directory",
  marketplace: "Marketplace",
  google_business: "Google Business",
  other: "Other",
};

// --- imports ---------------------------------------------------------------

export const IMPORT_FILE_TYPES = ["csv", "xlsx"] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

export const IMPORT_STATUSES = [
  "uploaded",
  "mapped",
  "validating",
  "importing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const DUPLICATE_POLICIES = ["skip", "update"] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

// --- exports ---------------------------------------------------------------

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// --- audit log -------------------------------------------------------------

export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "saved",
  "status_changed",
  "assigned",
  "note_added",
  "reviewed",
  "rechecked",
  "merged",
  "duplicate_merged",
  "archived",
  "unarchived",
  "deleted",
  "bulk_archived",
  "bulk_deleted",
  "exported",
  "imported",
  "search_started",
  "search_cancelled",
  "settings_changed",
  "demo_data_loaded",
  "demo_data_removed",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
