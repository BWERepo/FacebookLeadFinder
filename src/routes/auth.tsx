import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirectPath } from "@/lib/safe-redirect";

type AuthSearch = { next?: string };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    next: safeRedirectPath(search.next),
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. opened /auth directly in a second tab) — don't make
  // them log in again.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        navigate({ to: next ?? "/dashboard", replace: true });
      }
    });
    return () => {
      active = false;
    };
  }, [navigate, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: next ?? "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed. Check your details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">Facebook Lead Finder</h1>
          <p className="text-sm text-muted-foreground">Business Web Express</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {mode === "signin" ? "Sign in" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Use your Business Web Express account."
                : "New accounts get access to the shared lead pool."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              {/* Both tabs share one form; only the name field differs. */}
              <TabsContent value={mode} forceMount>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="full-name">Full name</Label>
                      <Input
                        id="full-name"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
                  </Button>

                  {mode === "signin" ? (
                    <div className="text-center">
                      <Link
                        to="/forgot-password"
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                  ) : null}
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
