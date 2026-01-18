// src/pages/ResetPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { passwordSchema } from "@/lib/validations";

type ReadyState = "checking" | "ready" | "expired";

function getHashParams() {
  // HashRouter URLs look like:
  // https://site/bookie-vision/#/reset-password?code=...&type=recovery
  // or sometimes:
  // https://site/bookie-vision/#access_token=...&type=recovery&...
  const raw = window.location.hash || "";
  const afterHash = raw.startsWith("#") ? raw.slice(1) : raw;

  // If hash contains a route, params come after '?'
  const qIndex = afterHash.indexOf("?");
  if (qIndex >= 0) {
    return new URLSearchParams(afterHash.slice(qIndex + 1));
  }

  // If it's a pure fragment token (no route), it looks like key=value&key=value
  if (afterHash.includes("=") && afterHash.includes("&")) {
    // strip leading "/" if present
    const cleaned = afterHash.startsWith("/") ? afterHash.slice(1) : afterHash;
    return new URLSearchParams(cleaned);
  }

  return new URLSearchParams("");
}

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ReadyState>("checking");

  const { toast } = useToast();
  const navigate = useNavigate();

  const hasRecoverySignal = useMemo(() => {
    const p = getHashParams();
    const type = p.get("type") || "";
    // Supabase can send either:
    // - PKCE: ?code=...&type=recovery
    // - implicit: #access_token=...&type=recovery...
    const hasCode = !!p.get("code");
    const hasAccessToken = !!p.get("access_token");
    return type === "recovery" || hasCode || hasAccessToken;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      // 1) If we don't even see recovery params in the URL, it's not a valid entry
      if (!hasRecoverySignal) {
        if (!cancelled) setState("expired");
        return;
      }

      // 2) Give Supabase a moment to process the link (PKCE exchange/session creation)
      const tryGetSession = async () => {
        const { data } = await supabase.auth.getSession();
        return data.session ?? null;
      };

      // Try a few times (GH Pages + hash routing sometimes needs a beat)
      for (let i = 0; i < 6; i++) {
        const session = await tryGetSession();
        if (session) {
          if (!cancelled) setState("ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 350));
      }

      // 3) If still no session, treat as expired/invalid
      if (!cancelled) setState("expired");
    };

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // When arriving from the email link you may see PASSWORD_RECOVERY or SIGNED_IN
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setState("ready");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hasRecoverySignal]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      passwordSchema.parse(newPassword);

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({
        title: "Password updated!",
        description: "Your password has been reset. Please sign in again.",
      });

      // Sign out so the next sign-in uses the new password cleanly
      await supabase.auth.signOut();

      // Clean the URL so the old recovery token doesn't keep re-triggering weird flows
      try {
        window.location.hash = "#/auth";
      } catch {}

      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast({
        title: "Password reset failed",
        description: err?.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Opening reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Invalid or Expired Link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => navigate("/auth")} className="w-full">
              Back to Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // quick reload (sometimes GH pages caches a weird hash state)
                window.location.reload();
              }}
              className="w-full"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Reset Your Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min 12 chars, with uppercase, lowercase, number, special char"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
              />
              <p className="text-xs text-muted-foreground">
                Must include uppercase, lowercase, number, and special character
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
