-- One row per uploaded CSV/XLSX file.
--
-- Created before `leads` because leads.source_import_id points here.
--
-- The import wizard walks: uploaded -> mapped -> validating -> importing ->
-- completed. The row is written at each step so a half-finished import is
-- visible in history rather than silently vanishing on a page reload.

CREATE TABLE public.imports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  filename  text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  file_size integer,

  status text NOT NULL DEFAULT 'uploaded'
         CHECK (status IN ('uploaded', 'mapped', 'validating', 'importing',
                           'completed', 'failed', 'cancelled')),

  -- { leadColumn: sourceHeader }, chosen by the user in the mapping step.
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'skip' leaves an existing lead untouched; 'update' fills its blank fields.
  on_duplicate   text NOT NULL DEFAULT 'skip' CHECK (on_duplicate IN ('skip', 'update')),

  total_rows      integer NOT NULL DEFAULT 0,
  valid_rows      integer NOT NULL DEFAULT 0,
  invalid_rows    integer NOT NULL DEFAULT 0,
  imported_rows   integer NOT NULL DEFAULT 0,
  updated_rows    integer NOT NULL DEFAULT 0,
  skipped_rows    integer NOT NULL DEFAULT 0,
  duplicate_rows  integer NOT NULL DEFAULT 0,
  error_rows      integer NOT NULL DEFAULT 0,

  -- [{row, column, value, reason}] — capped in application code so one badly
  -- broken 10k-row file can't write a multi-megabyte JSON blob.
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX imports_created_idx ON public.imports (created_at DESC);
CREATE INDEX imports_creator_idx ON public.imports (created_by, created_at DESC);

CREATE TRIGGER imports_set_updated_at
  BEFORE UPDATE ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.imports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view all imports"
  ON public.imports FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE POLICY "Members can create imports"
  ON public.imports FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Members can update imports"
  ON public.imports FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid()))
  WITH CHECK (public.is_member(auth.uid()));

CREATE POLICY "Members can delete imports"
  ON public.imports FOR DELETE TO authenticated
  USING (public.is_member(auth.uid()));

NOTIFY pgrst, 'reload schema';
