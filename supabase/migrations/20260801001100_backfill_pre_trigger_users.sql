-- Backfill profiles/roles for any auth.users row created before the
-- on_auth_user_created trigger (see 20260801000000_core_auth.sql) existed.
--
-- Those accounts have no public.profiles row and no public.user_roles row, so
-- is_member() returns false for them and every RLS-gated insert (starting a
-- search, etc.) fails with a row-level security violation. New signups are
-- unaffected — the trigger has covered them since that migration ran.

INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data ->> 'full_name', '')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'member'
FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;
