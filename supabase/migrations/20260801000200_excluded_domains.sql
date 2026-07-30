-- Domains that must never be treated as a business's own website.
--
-- A copy of the built-in catalogue lives in
-- src/data/excluded-domains.catalog.ts so the pure verification logic can run
-- in a unit test with no database. This table is the *editable* layer: it seeds
-- from that catalogue and lets a user add their own, or disable a built-in
-- (for example, to start counting marketplace storefronts as real websites).

CREATE TABLE public.excluded_domains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain     text NOT NULL UNIQUE,
  kind       text NOT NULL DEFAULT 'directory'
             CHECK (kind IN ('facebook', 'other_social', 'directory', 'marketplace',
                             'google_business', 'other')),
  is_builtin boolean NOT NULL DEFAULT false,
  enabled    boolean NOT NULL DEFAULT true,
  note       text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Registrable domain or host only. A path-scoped exclusion (etsy.com/shop)
  -- is expressed in the code catalogue, not here, because matching a path
  -- needs the URL parser.
  CONSTRAINT excluded_domains_domain_format
    CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

CREATE INDEX excluded_domains_enabled_idx ON public.excluded_domains (enabled);

CREATE TRIGGER excluded_domains_set_updated_at
  BEFORE UPDATE ON public.excluded_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.excluded_domains FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.excluded_domains TO authenticated;
GRANT ALL ON public.excluded_domains TO service_role;

ALTER TABLE public.excluded_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view excluded domains"
  ON public.excluded_domains FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can add excluded domains"
  ON public.excluded_domains FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid())
    AND created_by = auth.uid()
    AND is_builtin = false
  );

CREATE POLICY "Members can update excluded domains"
  ON public.excluded_domains FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()))
  WITH CHECK (public.is_member(auth.uid()));

-- Built-ins can be disabled but not deleted — a deleted built-in would silently
-- come back on the next re-run of the seed migration, which is worse than an
-- explicit `enabled = false` row.
CREATE POLICY "Members can delete custom excluded domains"
  ON public.excluded_domains FOR DELETE TO authenticated
  USING (public.is_member(auth.uid()) AND is_builtin = false);

CREATE POLICY "Admins can manage all excluded domains"
  ON public.excluded_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
