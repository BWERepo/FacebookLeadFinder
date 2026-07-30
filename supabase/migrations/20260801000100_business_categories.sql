-- Business categories offered in the search forms.
--
-- Presets (is_preset = true) ship with the app and are shared by everyone.
-- Members can add their own; a preset can be disabled but not deleted, so the
-- slug a historical lead was tagged with never dangles.

CREATE TABLE public.business_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_preset  boolean NOT NULL DEFAULT false,
  enabled    boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

CREATE INDEX business_categories_enabled_idx
  ON public.business_categories (enabled, sort_order);

CREATE TRIGGER business_categories_set_updated_at
  BEFORE UPDATE ON public.business_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.business_categories FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.business_categories TO authenticated;
GRANT ALL ON public.business_categories TO service_role;

ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view categories"
  ON public.business_categories FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can add categories"
  ON public.business_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid())
    AND created_by = auth.uid()
    AND is_preset = false
  );

-- Members may rename or disable a custom category. Presets are admin-only:
-- renaming one out from under everyone else's saved leads is a bigger decision
-- than it looks.
CREATE POLICY "Members can update custom categories"
  ON public.business_categories FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()) AND is_preset = false)
  WITH CHECK (public.is_member(auth.uid()) AND is_preset = false);

CREATE POLICY "Admins can manage all categories"
  ON public.business_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
