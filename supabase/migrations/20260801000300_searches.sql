-- A search IS a background job.
--
-- Cloudflare Workers here have no Queues and no Durable Objects, so there is
-- nowhere to park a long-running process. Instead this row is the durable job
-- record: the client calls `advanceSearch` repeatedly, each call does a bounded
-- chunk of work inside one ordinary request, and everything needed to resume
-- lives in these columns. Close the tab mid-run and the job stops exactly where
-- it was; hit Resume and it carries on. Nothing is lost.
--
-- The per-candidate work queue is `search_results` (see its own migration).

CREATE TABLE public.searches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- --- criteria ------------------------------------------------------------
  search_type   text NOT NULL
                CHECK (search_type IN ('zip_radius', 'area_code', 'state_county')),
  zip           text,
  radius_miles  integer CHECK (radius_miles IS NULL OR radius_miles BETWEEN 1 AND 100),
  area_code     text CHECK (area_code IS NULL OR area_code ~ '^[2-9][0-9]{2}$'),
  state         text CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  county        text,
  city          text,
  category      text NOT NULL DEFAULT '',
  category_slug text NOT NULL DEFAULT 'other',
  max_results   integer NOT NULL DEFAULT 100 CHECK (max_results BETWEEN 1 AND 500),
  -- The full validated criteria object, so a "repeat this search" months later
  -- replays exactly what was asked for even if the columns above have evolved.
  criteria      jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider      text NOT NULL DEFAULT 'mock',

  -- Each search_type requires its own fields. Enforced here rather than only in
  -- Zod so a bad row can't be written by any path, including the seeder.
  CONSTRAINT searches_criteria_present CHECK (
    CASE search_type
      WHEN 'zip_radius'   THEN zip IS NOT NULL AND radius_miles IS NOT NULL
      WHEN 'area_code'    THEN area_code IS NOT NULL
      WHEN 'state_county' THEN state IS NOT NULL AND county IS NOT NULL
    END
  ),

  -- --- job state -----------------------------------------------------------
  status text NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'running', 'completed',
                           'partially_completed', 'failed', 'cancelled')),
  phase  text NOT NULL DEFAULT 'discover'
         CHECK (phase IN ('discover', 'verify', 'finalize', 'done')),
  -- Cancellation is cooperative: this flag is set, and the next chunk sees it
  -- and stops. Killing a request mid-flight would lose the candidate it was
  -- working on.
  cancel_requested boolean NOT NULL DEFAULT false,

  -- --- chunking and leasing ------------------------------------------------
  -- Where discovery is up to: {pageToken, zipQueue: [], zipIndex}.
  cursor            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The lease is the concurrency guard. Two browser tabs (or a double-fired
  -- effect) cannot advance the same job at once, because acquiring it is a
  -- conditional UPDATE that only one of them can win.
  lease_token       uuid,
  lease_expires_at  timestamptz,
  heartbeat_at      timestamptz,
  chunk_count       integer NOT NULL DEFAULT 0,

  -- --- progress counters ---------------------------------------------------
  candidates_discovered integer NOT NULL DEFAULT 0,
  candidates_processed  integer NOT NULL DEFAULT 0,
  facebook_pages_found  integer NOT NULL DEFAULT 0,
  websites_checked      integer NOT NULL DEFAULT 0,
  qualified_found       integer NOT NULL DEFAULT 0,
  needs_review_found    integer NOT NULL DEFAULT 0,
  duplicates_skipped    integer NOT NULL DEFAULT 0,
  provider_calls        integer NOT NULL DEFAULT 0,
  error_count           integer NOT NULL DEFAULT 0,
  last_error            text,
  -- Non-fatal things worth telling the user: a clamped radius, a provider
  -- fallback to mock, a truncated ZIP queue.
  notes                 jsonb NOT NULL DEFAULT '[]'::jsonb,

  started_at timestamptz,
  ended_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX searches_created_idx ON public.searches (created_at DESC);
CREATE INDEX searches_creator_idx ON public.searches (created_by, created_at DESC);
-- Partial index for the sweeper and the per-user concurrency cap, which only
-- ever look at live jobs.
CREATE INDEX searches_active_idx ON public.searches (heartbeat_at)
  WHERE status IN ('pending', 'running');

CREATE TRIGGER searches_set_updated_at
  BEFORE UPDATE ON public.searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.searches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.searches TO authenticated;
GRANT ALL ON public.searches TO service_role;

ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view all searches"
  ON public.searches FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can start searches"
  ON public.searches FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND created_by = auth.uid());

-- Any member can advance or cancel any job: if someone's tab died mid-run,
-- a colleague hitting Resume is the desired behaviour, not a permission error.
CREATE POLICY "Members can update searches"
  ON public.searches FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()))
  WITH CHECK (public.is_member(auth.uid()));

CREATE POLICY "Members can delete searches"
  ON public.searches FOR DELETE TO authenticated
  USING (public.is_member(auth.uid()));

NOTIFY pgrst, 'reload schema';
