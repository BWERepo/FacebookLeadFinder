import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// There is no public landing page — this is an internal tool. `/` just decides
// which side of the auth gate you belong on.
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({
      to: data.session ? "/dashboard" : "/auth",
      search: data.session ? undefined : { next: "/dashboard" },
    });
  },
  component: () => null,
});
