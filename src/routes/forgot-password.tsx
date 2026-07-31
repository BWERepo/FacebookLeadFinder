import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        // window.location.origin is only protocol+host — it doesn't include
        // the base path this app is served under when that isn't "/" (e.g.
        // staging's /Staging.FacebookLeadFinder), so BASE_URL has to be
        // spliced in too or the emailed link 404s once it's clicked.
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
      // Always report the same outcome, whether or not the address exists.
      // Distinguishing the two would turn this form into an account-enumeration
      // oracle.
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Reset your password</CardTitle>
          <CardDescription>
            {sent
              ? "If that address has an account, a reset link is on its way."
              : "We'll email you a link to set a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth" search={{ next: undefined }}>
                Back to sign in
              </Link>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/auth" search={{ next: undefined }}>
                  Back to sign in
                </Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
