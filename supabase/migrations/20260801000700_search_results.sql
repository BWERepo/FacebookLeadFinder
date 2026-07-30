-- One row per candidate business a search discovered.
--
-- This table does double duty:
--
--   1. It is the durable work queue. Discovery writes rows with
--      processing_state = 'queued'; each verify chunk claims a few, processes
--      them, and marks them 'processed'. Because each candidate is committed
--      independently, a crash mid-chunk loses at most one candidate — and
--      resuming just picks up whatever is still 'queued'.
--
--   2. It is the result set. A candidate that turned out to be a duplicate
--      creates no lead, but its row still records *why*, so the results table
--      can show "Possible duplicate" with a link to the existing lead instead
--      of silently dropping it.

CREATE TABLE public.search_results (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,

  processing_state text NOT NULL DEFAULT 'queued'
                   CHECK (processing_state IN ('queued', 'processing', 'processed',
                                               'skipped', 'error')),
  attempts      integer NOT NULL DEFAULT 0,
  error_message text,

  -- Exactly what the provider returned, before any interpretation. Kept so a
  -- classification bug can be re-run against the original data rather than
  -- needing the search to be paid for again.
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- CandidateUrl[] after enrichment: every URL considered, with where it came
  -- from and whether it was reachable.
  candidate_urls jsonb NOT NULL DEFAULT '[]'::jsonb,

  lead_id              uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  duplicate_of_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  duplicate_rule       text,
  duplicate_certainty  text CHECK (duplicate_certainty IS NULL
                                   OR duplicate_certainty IN ('certain', 'probable', 'possible')),

  -- Denormalized from the lead so the per-search results view is one query.
  website_status   text,
  qualified        boolean,
  confidence_score integer,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The queue-claiming query: next N queued rows for this search, oldest first.
CREATE INDEX search_results_queue_idx
  ON public.search_results (search_id, processing_state, created_at);
CREATE INDEX search_results_lead_idx ON public.search_results (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE TRIGGER search_results_set_updated_at
  BEFORE UPDATE ON public.search_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.search_results FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_results TO authenticated;
GRANT ALL ON public.search_results TO service_role;

ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view search results"
  ON public.search_results FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can create search results"
  ON public.search_results FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()));

CREATE POLICY "Members can update search results"
  ON public.search_results FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()))
  WITH CHECK (public.is_member(auth.uid()));

CREATE POLICY "Members can delete search results"
  ON public.search_results FOR DELETE TO authenticated
  USING (public.is_member(auth.uid()));

NOTIFY pgrst, 'reload schema';
