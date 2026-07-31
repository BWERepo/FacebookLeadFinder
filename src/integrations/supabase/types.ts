// Database types, hand-maintained to match supabase/migrations/.
//
// There is no linked Supabase CLI in this project — migrations are applied in
// the hosted SQL editor — so `supabase gen types` is not wired up. When you add
// or change a migration, update this file in the SAME commit. A stale type here
// is worse than no type, because it type-checks clean and fails at runtime.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// The closed vocabularies (website_status, lead_status, ...) are declared once
// in src/lib/domain.ts as runtime arrays and derived into types there, because
// domain.test.ts checks those arrays against the CHECK constraints in
// supabase/migrations/. Re-declaring them here would defeat that guard, so this
// file imports and re-exports them instead.
export type {
  ActivityAction,
  AppRole,
  ConfidenceBand,
  DuplicateCertainty,
  DuplicatePolicy,
  EmailStatus,
  ExcludedDomainKind,
  ExportFormat,
  ImportFileType,
  ImportStatus,
  LeadStatus,
  ProcessingState,
  SearchPhase,
  SearchStatus,
  SearchType,
  WebsiteStatus,
} from "@/lib/domain";

import type {
  ActivityAction,
  AppRole,
  ConfidenceBand,
  DuplicateCertainty,
  DuplicatePolicy,
  EmailStatus,
  ExcludedDomainKind,
  ExportFormat,
  ImportFileType,
  ImportStatus,
  LeadStatus,
  ProcessingState,
  SearchPhase,
  SearchStatus,
  SearchType,
  WebsiteStatus,
} from "@/lib/domain";

// --- Row shapes ------------------------------------------------------------

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
};

type UserRoleRow = {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
};

type BusinessCategoryRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_preset: boolean;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExcludedDomainRow = {
  id: string;
  domain: string;
  kind: ExcludedDomainKind;
  is_builtin: boolean;
  enabled: boolean;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SearchRow = {
  id: string;
  created_by: string;
  search_type: SearchType;
  zip: string | null;
  radius_miles: number | null;
  area_code: string | null;
  state: string | null;
  county: string | null;
  city: string | null;
  category: string;
  category_slug: string;
  max_results: number;
  criteria: Json;
  provider: string;
  status: SearchStatus;
  phase: SearchPhase;
  cancel_requested: boolean;
  cursor: Json;
  lease_token: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  chunk_count: number;
  candidates_discovered: number;
  candidates_processed: number;
  facebook_pages_found: number;
  websites_checked: number;
  qualified_found: number;
  needs_review_found: number;
  duplicates_skipped: number;
  provider_calls: number;
  error_count: number;
  last_error: string | null;
  notes: Json;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type ImportRow = {
  id: string;
  created_by: string;
  filename: string;
  file_type: ImportFileType;
  file_size: number | null;
  status: ImportStatus;
  column_mapping: Json;
  on_duplicate: DuplicatePolicy;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_rows: number;
  updated_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  error_rows: number;
  errors: Json;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

type LeadRow = {
  id: string;
  created_by: string;

  business_name: string;
  normalized_name: string;
  category: string;
  category_slug: string;

  address: string;
  normalized_address: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;

  phone: string;
  normalized_phone: string | null;
  area_code: string | null;

  email: string | null;
  normalized_email: string | null;
  email_status: EmailStatus;

  facebook_url: string | null;
  normalized_facebook_url: string | null;

  website_status: WebsiteStatus;
  potential_website_url: string | null;
  qualified: boolean;
  confidence_score: number;
  confidence_band: ConfidenceBand;
  confidence_breakdown: Json;
  verification_notes: string;
  sources: Json;

  provider: string;
  provider_place_id: string | null;

  lead_status: LeadStatus;
  assigned_user_id: string | null;
  last_contact_date: string | null;
  next_followup_date: string | null;
  email_sent_at: string | null;
  opportunity_score: number | null;
  estimated_value_cents: number | null;

  is_demo: boolean;
  saved: boolean;
  reviewed_at: string | null;
  source_search_id: string | null;
  source_import_id: string | null;

  first_found_at: string;
  last_checked_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type LeadNoteRow = {
  id: string;
  lead_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type SearchResultRow = {
  id: string;
  search_id: string;
  processing_state: ProcessingState;
  attempts: number;
  error_message: string | null;
  raw: Json;
  candidate_urls: Json;
  lead_id: string | null;
  duplicate_of_lead_id: string | null;
  duplicate_rule: string | null;
  duplicate_certainty: DuplicateCertainty | null;
  website_status: WebsiteStatus | null;
  qualified: boolean | null;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
};

type LeadActivityRow = {
  id: string;
  lead_id: string | null;
  actor_id: string | null;
  action: ActivityAction;
  description: string;
  detail: Json;
  created_at: string;
};

type UserSettingsRow = {
  user_id: string;
  provider: string;
  default_radius_miles: number;
  default_max_results: number;
  confidence_threshold: number;
  count_marketplace_as_website: boolean;
  count_google_business_as_website: boolean;
  export_format: ExportFormat;
  export_include_unqualified: boolean;
  duplicate_rules: Json;
  chunk_size: number;
  created_at: string;
  updated_at: string;
};

// --- Insert/Update derivation ----------------------------------------------
// Every table gives its own id and timestamps defaults, so an insert only has
// to supply the columns without one. Rather than write three near-identical
// shapes per table by hand (and let them drift), derive them.

/** Columns every table defaults, so they're never required on insert. */
type AlwaysOptional = "id" | "created_at" | "updated_at";

/** `Row` minus the always-defaulted columns, with `Defaulted` also optional. */
type InsertOf<Row, Defaulted extends keyof Row = never> =
  Omit<Row, Extract<AlwaysOptional, keyof Row>> extends infer Base
    ? Omit<Base, Extract<Defaulted, keyof Base>> &
        Partial<Pick<Row, Extract<AlwaysOptional | Defaulted, keyof Row>>>
    : never;

type UpdateOf<Row> = Partial<Row>;

type Table<Row, Insert, Update = UpdateOf<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, InsertOf<ProfileRow, "full_name">>;
      user_roles: Table<UserRoleRow, InsertOf<UserRoleRow>>;
      business_categories: Table<
        BusinessCategoryRow,
        InsertOf<BusinessCategoryRow, "sort_order" | "is_preset" | "enabled" | "created_by">
      >;
      excluded_domains: Table<
        ExcludedDomainRow,
        InsertOf<ExcludedDomainRow, "kind" | "is_builtin" | "enabled" | "note" | "created_by">
      >;
      searches: Table<
        SearchRow,
        InsertOf<
          SearchRow,
          | "zip"
          | "radius_miles"
          | "area_code"
          | "state"
          | "county"
          | "city"
          | "category"
          | "category_slug"
          | "max_results"
          | "criteria"
          | "provider"
          | "status"
          | "phase"
          | "cancel_requested"
          | "cursor"
          | "lease_token"
          | "lease_expires_at"
          | "heartbeat_at"
          | "chunk_count"
          | "candidates_discovered"
          | "candidates_processed"
          | "facebook_pages_found"
          | "websites_checked"
          | "qualified_found"
          | "needs_review_found"
          | "duplicates_skipped"
          | "provider_calls"
          | "error_count"
          | "last_error"
          | "notes"
          | "started_at"
          | "ended_at"
        >
      >;
      imports: Table<
        ImportRow,
        InsertOf<
          ImportRow,
          | "file_size"
          | "status"
          | "column_mapping"
          | "on_duplicate"
          | "total_rows"
          | "valid_rows"
          | "invalid_rows"
          | "imported_rows"
          | "updated_rows"
          | "skipped_rows"
          | "duplicate_rows"
          | "error_rows"
          | "errors"
          | "completed_at"
        >
      >;
      // Only business_name and created_by are genuinely required; every other
      // lead column either defaults or is nullable.
      leads: Table<
        LeadRow,
        Pick<LeadRow, "business_name" | "created_by"> &
          Partial<Omit<LeadRow, "business_name" | "created_by">>
      >;
      lead_notes: Table<LeadNoteRow, InsertOf<LeadNoteRow>>;
      search_results: Table<
        SearchResultRow,
        InsertOf<
          SearchResultRow,
          | "processing_state"
          | "attempts"
          | "error_message"
          | "raw"
          | "candidate_urls"
          | "lead_id"
          | "duplicate_of_lead_id"
          | "duplicate_rule"
          | "duplicate_certainty"
          | "website_status"
          | "qualified"
          | "confidence_score"
        >
      >;
      lead_activities: Table<
        LeadActivityRow,
        InsertOf<LeadActivityRow, "lead_id" | "actor_id" | "description" | "detail">
      >;
      user_settings: Table<
        UserSettingsRow,
        Pick<UserSettingsRow, "user_id"> & Partial<Omit<UserSettingsRow, "user_id">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      has_role: {
        Args: { _user_id: string; _role: AppRole };
        Returns: boolean;
      };
      is_member: {
        Args: { _user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

// Convenience aliases so application code doesn't repeat the deep path.
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
