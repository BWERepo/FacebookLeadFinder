-- Append-only audit log.
--
-- The leads pool is shared and destructive actions are bulk-capable ("delete
-- 240 leads"), so there has to be a record of who did what. Note the grants:
-- authenticated gets SELECT and INSERT and nothing else. No UPDATE, no DELETE,
-- no policy for either — a log you can edit is not a log.
--
-- lead_id is nullable and ON DELETE SET NULL on purpose: deleting a lead must
-- not erase the record that it was deleted. The detail payload keeps enough
-- identifying information to make the orphaned row meaningful.

CREATE TABLE public.lead_activities (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id  uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  action text NOT NULL CHECK (action IN (
    'created', 'updated', 'saved', 'status_changed', 'assigned',
    'note_added', 'reviewed', 'rechecked', 'merged', 'duplicate_merged',
    'archived', 'unarchived', 'deleted', 'bulk_archived', 'bulk_deleted',
    'exported', 'imported', 'search_started', 'search_cancelled',
    'settings_changed', 'demo_data_loaded', 'demo_data_removed'
  )),
  -- Human-readable summary, written at the same time as the structured detail
  -- so the timeline is readable without a lookup table in the UI.
  description text NOT NULL DEFAULT '',
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX lead_activities_created_idx ON public.lead_activities (created_at DESC);
CREATE INDEX lead_activities_actor_idx ON public.lead_activities (actor_id, created_at DESC);

REVOKE ALL ON public.lead_activities FROM anon;
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view activity"
  ON public.lead_activities FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

-- actor_id must be the caller: you cannot write an audit entry in someone
-- else's name.
CREATE POLICY "Members can record their own activity"
  ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND actor_id = auth.uid());

NOTIFY pgrst, 'reload schema';
