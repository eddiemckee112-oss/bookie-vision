import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ✅ token from URL OR fallback from localStorage (important for email-invite + auth redirects)
  const tokenFromUrl = searchParams.get("token");
  const tokenFromStorage =
    typeof window !== "undefined" ? localStorage.getItem("pendingInviteToken") : null;

  const token = tokenFromUrl || tokenFromStorage;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"checking" | "success" | "error" | "needs-auth">("checking");
  const [message, setMessage] = useState("");
  const [orgName, setOrgName] = useState("");

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

    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // User needs to sign in first
      setStatus("needs-auth");
      setMessage("Please sign in or create an account to accept this invitation");
      setLoading(false);

      // ✅ Store token for after authentication
      localStorage.setItem("pendingInviteToken", token);
      return;
    }

    // User is authenticated, proceed with invite acceptance
    try {
      // ✅ Once logged in, no longer need the stored token
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

      setOrgName(invite.orgs?.name || "the organization");

      // ✅ Check if user is already a member (use maybeSingle so it doesn't throw)
      const { data: existingMember, error: existingErr } = await supabase
        .from("org_users")
        .select("id")
        .eq("org_id", invite.org_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingErr) {
        throw existingErr;
      }

      if (existingMember) {
        // Already a member, just mark invite as accepted
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
        role: invite.role, // must match your enum values
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

      // Set this org as active and redirect
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
    // Redirect to auth page; token is stored in localStorage
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
