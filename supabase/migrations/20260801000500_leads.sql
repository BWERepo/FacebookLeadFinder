-- The lead record.
--
-- Two families of columns sit side by side and they mean different things:
--
--   * The raw values as published (business_name, phone, email, facebook_url).
--     These are what a user sees and what an export contains.
--   * The normalized_* values, written by the application from the pure
--     functions in src/lib/dedupe.ts. These exist only so duplicate detection
--     and indexed lookups can compare apples to apples — "(865) 555-0142" and
--     "+1 865.555.0142" are the same business. They are never displayed.
--
-- Normalization is done in TypeScript rather than in a generated column so that
-- the exact same function runs in a unit test, in the import parser, and in the
-- search pipeline. One implementation, one set of tests.

CREATE TABLE public.leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- --- identity ------------------------------------------------------------
  business_name   text NOT NULL,
  normalized_name text NOT NULL DEFAULT '',
  category        text NOT NULL DEFAULT '',
  category_slug   text NOT NULL DEFAULT 'other',

  -- --- location ------------------------------------------------------------
  address            text NOT NULL DEFAULT '',
  normalized_address text NOT NULL DEFAULT '',
  city               text NOT NULL DEFAULT '',
  county             text NOT NULL DEFAULT '',
  state              text NOT NULL DEFAULT '',
  zip                text NOT NULL DEFAULT '',
  latitude           double precision,
  longitude          double precision,

  -- --- contact -------------------------------------------------------------
  phone            text NOT NULL DEFAULT '',
  normalized_phone text CHECK (normalized_phone IS NULL OR normalized_phone ~ '^[0-9]{10}$'),
  area_code        text CHECK (area_code IS NULL OR area_code ~ '^[0-9]{3}$'),

  email            text,
  normalized_email text,
  -- 'not_found' is the honest default. Nothing in this app ever constructs an
  -- address from a name and a domain — see COMPLIANCE.md.
  email_status     text NOT NULL DEFAULT 'not_found'
                   CHECK (email_status IN ('verified', 'publicly_listed',
                                           'unverified', 'not_found')),

  facebook_url            text,
  normalized_facebook_url text,

  -- --- website verification ------------------------------------------------
  website_status text NOT NULL DEFAULT 'needs_manual_review'
                 CHECK (website_status IN ('no_website_found', 'website_found',
                                           'facebook_only', 'needs_manual_review',
                                           'unable_to_verify')),
  potential_website_url text,

  -- A lead is qualified only when it has a Facebook page AND no separate site
  -- was found. Enforced here as well as in src/lib/verification.ts: this is the
  -- product's central claim, so it should be impossible to write a row that
  -- contradicts it, whatever code path is doing the writing.
  qualified boolean NOT NULL DEFAULT false,
  CONSTRAINT leads_qualified_requires_evidence CHECK (
    qualified = false
    OR (website_status IN ('no_website_found', 'facebook_only')
        AND normalized_facebook_url IS NOT NULL)
  ),

  confidence_score     integer NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_band      text NOT NULL DEFAULT 'manual'
                       CHECK (confidence_band IN ('high', 'medium', 'manual')),
  -- The per-signal points table, so the score is always explainable in the UI
  -- rather than being a magic number.
  confidence_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_notes   text NOT NULL DEFAULT '',
  -- [{source, url, fetched_at}] — where each claim came from.
  sources              jsonb NOT NULL DEFAULT '[]'::jsonb,

  provider          text NOT NULL DEFAULT 'mock',
  provider_place_id text,

  -- --- pipeline ------------------------------------------------------------
  lead_status text NOT NULL DEFAULT 'new'
              CHECK (lead_status IN ('new', 'not_contacted', 'contacted', 'responded',
                                     'interested', 'prototype_offered', 'prototype_created',
                                     'proposal_sent', 'customer', 'not_interested',
                                     'do_not_contact', 'archived')),
  assigned_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contact_date  date,
  next_followup_date date,
  opportunity_score  integer CHECK (opportunity_score IS NULL
                                    OR opportunity_score BETWEEN 0 AND 100),
  -- Cents, not a float. Money in a float is a bug waiting for a rounding error.
  estimated_value_cents integer CHECK (estimated_value_cents IS NULL
                                       OR estimated_value_cents >= 0),

  -- --- provenance ----------------------------------------------------------
  is_demo          boolean NOT NULL DEFAULT false,
  saved            boolean NOT NULL DEFAULT false,
  reviewed_at      timestamptz,
  source_search_id uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  source_import_id uuid REFERENCES public.imports(id) ON DELETE SET NULL,

  first_found_at  timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- --- indexes ---------------------------------------------------------------
-- The application checks for duplicates before inserting, but a race between
-- two chunks could still slip past that check. This partial unique index is the
-- backstop: the insert fails and the caller falls back to the merge path.
CREATE UNIQUE INDEX leads_facebook_url_uidx
  ON public.leads (normalized_facebook_url)
  WHERE normalized_facebook_url IS NOT NULL;

CREATE UNIQUE INDEX leads_place_id_uidx
  ON public.leads (provider, provider_place_id)
  WHERE provider_place_id IS NOT NULL;

CREATE INDEX leads_created_idx        ON public.leads (created_at DESC);
CREATE INDEX leads_normalized_name_idx ON public.leads (normalized_name);
CREATE INDEX leads_normalized_phone_idx ON public.leads (normalized_phone)
  WHERE normalized_phone IS NOT NULL;
CREATE INDEX leads_normalized_email_idx ON public.leads (normalized_email)
  WHERE normalized_email IS NOT NULL;
CREATE INDEX leads_zip_idx            ON public.leads (zip);
CREATE INDEX leads_state_county_idx   ON public.leads (state, county);
CREATE INDEX leads_lead_status_idx    ON public.leads (lead_status);
CREATE INDEX leads_website_status_idx ON public.leads (website_status);
CREATE INDEX leads_category_idx       ON public.leads (category_slug);
CREATE INDEX leads_qualified_idx      ON public.leads (qualified, created_at DESC);
CREATE INDEX leads_assigned_idx       ON public.leads (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;
CREATE INDEX leads_followup_idx       ON public.leads (next_followup_date)
  WHERE next_followup_date IS NOT NULL AND archived_at IS NULL;
-- The default list view: unarchived, newest first.
CREATE INDEX leads_active_idx         ON public.leads (created_at DESC)
  WHERE archived_at IS NULL;

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- grants and RLS --------------------------------------------------------
REVOKE ALL ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view all leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can create leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Members can update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()))
  WITH CHECK (public.is_member(auth.uid()));

CREATE POLICY "Members can delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_member(auth.uid()));

NOTIFY pgrst, 'reload schema';
