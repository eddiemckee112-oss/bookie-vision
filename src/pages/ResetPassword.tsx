import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { passwordSchema } from "@/lib/validations";

function getCodeFromUrl(): string | null {
  // 1) Normal query: https://site.com/reset-password?code=...
  const url = new URL(window.location.href);
  const codeFromSearch = url.searchParams.get("code");
  if (codeFromSearch) return codeFromSearch;

  // 2) Hash query: https://site.com/#/reset-password?code=...
  // window.location.hash = "#/reset-password?code=XXXX"
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return null;

  const hashQuery = hash.slice(qIndex + 1); // "code=XXXX&..."
  const params = new URLSearchParams(hashQuery);
  return params.get("code");
}

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const verifyRecoverySession = async () => {
      try {
        // If Supabase sent a PKCE "code", it might be in search OR inside the hash.
        const code = getCodeFromUrl();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("exchangeCodeForSession error:", error);
          }
        }

        // Now check for an actual session
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("getSession error:", error);

        if (!cancelled) {
          setIsValidToken(!!data.session);
        }
      } catch (e) {
        console.error("verifyRecoverySession error:", e);
        if (!cancelled) setIsValidToken(false);
      }
    };

    verifyRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

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
        description: "Your password has been successfully reset.",
      });

      setTimeout(() => navigate("/dashboard"), 700);
    } catch (error: any) {
      toast({
        title: "Password reset failed",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Verifying reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidToken) {
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
              variant="secondary"
              onClick={() => window.location.reload()}
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
