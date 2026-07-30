-- Per-user preferences. The one table in this app that is NOT shared: your
-- default search radius is yours.
--
-- There is deliberately no api_key column of any kind. Provider credentials are
-- Cloudflare Worker secrets, read from process.env inside server handlers and
-- never returned to the browser. The Settings page asks a server function
-- whether a key is configured and gets back {configured, tail} — never a value.

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  provider text NOT NULL DEFAULT 'mock',

  default_radius_miles integer NOT NULL DEFAULT 10
                       CHECK (default_radius_miles BETWEEN 1 AND 100),
  default_max_results  integer NOT NULL DEFAULT 100
                       CHECK (default_max_results BETWEEN 1 AND 500),

  -- A lead must clear this score as well as having a qualifying website status
  -- before it is presented as qualified.
  confidence_threshold integer NOT NULL DEFAULT 60
                       CHECK (confidence_threshold BETWEEN 0 AND 100),

  -- Off by default: a Square/Etsy storefront is not a business website in the
  -- sense this tool cares about — those businesses are still prospects.
  count_marketplace_as_website     boolean NOT NULL DEFAULT false,
  count_google_business_as_website boolean NOT NULL DEFAULT false,

  export_format             text NOT NULL DEFAULT 'xlsx'
                            CHECK (export_format IN ('csv', 'xlsx')),
  export_include_unqualified boolean NOT NULL DEFAULT false,

  -- Which of the probable/possible duplicate rules are active. Certain-match
  -- rules are not configurable — turning off "same Facebook URL means same
  -- business" would just create duplicates.
  duplicate_rules jsonb NOT NULL DEFAULT
    '{"phone_only": true, "name_and_zip": true, "email": true, "fuzzy_name_and_city": true}'::jsonb,

  -- Candidates processed per advanceSearch call. Lower it if the provider is
  -- slow enough that a chunk risks the Worker's request budget.
  chunk_size integer NOT NULL DEFAULT 5 CHECK (chunk_size BETWEEN 1 AND 10),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.user_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON public.user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings"
  ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
