-- Free-text notes on a lead. A thread, not a single field, so two people
-- working the same shared pool can each leave a note without overwriting the
-- other's.

CREATE TABLE public.lead_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_notes_lead_idx ON public.lead_notes (lead_id, created_at DESC);

CREATE TRIGGER lead_notes_set_updated_at
  BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.lead_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lead notes"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can add lead notes"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND author_id = auth.uid());

-- Unlike leads, a note is attributed speech: you can edit or delete your own,
-- but not someone else's. Admins can remove anything.
CREATE POLICY "Authors can edit their own notes"
  ON public.lead_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their own notes"
  ON public.lead_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Admins can manage all lead notes"
  ON public.lead_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
