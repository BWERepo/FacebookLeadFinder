import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // getSession() rather than getUser(): it resolves from the already-recovered
  // local session instead of a network round trip, so a cold load straight into
  // /leads doesn't flash the login form before the network call lands.
  //
  // Route gating here is UX only. Actual data access is enforced by Row Level
  // Security in Postgres, so trusting the local session at this layer doesn't
  // weaken anything real.
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname } });
    }
    return { user: data.session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
