import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

function getTokenFromHashOrSearch(): string | null {
  // 1) normal query string (rare for hash router but safe)
  const sp = new URLSearchParams(window.location.search);
  const fromSearch = sp.get("token");
  if (fromSearch) return fromSearch;

  // 2) hash router query inside the hash
  // examples:
  //  "#/accept-invite?token=abc"
  //  "#/accept-invite?token=abc&x=y"
  const hash = window.location.hash || "";
  const idx = hash.indexOf("?");
  if (idx === -1) return null;

  const qs = hash.slice(idx + 1); // everything after '?'
  const hp = new URLSearchParams(qs);
  return hp.get("token");
}

function cleanInviteUrl() {
  // remove token from the URL so refresh doesn't re-run a stale token
  const base = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState(null, "", `${base}#/accept-invite`);
}

const AcceptInvite = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const tokenFromUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    return getTokenFromHashOrSearch();
  }, []);

  const tokenFromStorage =
    typeof window !== "undefined" ? localStorage.getItem("pendingInviteToken") : null;

  const token = tokenFromUrl || tokenFromStorage;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"checking" | "success" | "error" | "needs-auth">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkInviteAndAccept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const checkInviteAndAccept = async () => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid or missing invite token");
      setLoading(false);
      return;
    }

    // If token came from URL, clean it immediately
    // (prevents accidental reuse on refresh)
    if (tokenFromUrl) cleanInviteUrl();

    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("needs-auth");
      setMessage("Please sign in or create an account to accept this invitation");
      setLoading(false);

      // store token for after auth
      localStorage.setItem("pendingInviteToken", token);
      return;
    }

    try {
      // logged in: no longer need the stored token
      localStorage.removeItem("pendingInviteToken");

      // Look up the invite
      const { data: invite, error: inviteError } = await supabase
        .from("org_invites")
        .select("id, org_id, email, role, status, token, orgs(name)")
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (inviteError || !invite) {
        setStatus("error");
        setMessage("This invite is invalid, expired, or has already been used");
        setLoading(false);
        return;
      }

      // Check if already a member
      const { data: existingMember, error: existingErr } = await supabase
        .from("org_users")
        .select("id")
        .eq("org_id", invite.org_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingErr) throw existingErr;

      if (existingMember) {
        await supabase.from("org_invites").update({ status: "accepted" }).eq("id", invite.id);

        setStatus("success");
        setMessage(`You're already a member of ${invite.orgs?.name || "this org"}. Redirecting...`);

        localStorage.setItem("currentOrgId", invite.org_id);
        setTimeout(() => navigate("/dashboard"), 1500);
        return;
      }

      // Add user to org
      const { error: insertError } = await supabase.from("org_users").insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
      });

      if (insertError) throw insertError;

      // Mark invite as accepted
      const { error: updateError } = await supabase
        .from("org_invites")
        .update({ status: "accepted" })
        .eq("id", invite.id);

      if (updateError) throw updateError;

      toast({
        title: "Invitation accepted!",
        description: `You've joined ${invite.orgs?.name || "the organization"} as ${invite.role}`,
      });

      setStatus("success");
      setMessage(`Successfully joined ${invite.orgs?.name || "the organization"}!`);

      localStorage.setItem("currentOrgId", invite.org_id);
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (error: any) {
      console.error("Error accepting invite:", error);
      setStatus("error");
      setMessage(error.message || "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = () => {
    navigate("/auth");
  };

  if (loading || status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Processing your invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "needs-auth") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleSignIn} className="w-full">
              Sign In or Sign Up
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
          <div className="mx-auto mb-4">
            {status === "success" ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="h-16 w-16 text-destructive" />
            )}
          </div>
          <CardTitle>{status === "success" ? "Invitation Accepted!" : "Invitation Error"}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === "error" && (
            <Button onClick={() => navigate("/dashboard")} className="w-full">
              Go to Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
