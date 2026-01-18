import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { passwordSchema } from "@/lib/validations";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  // ✅ For GitHub Pages + HashRouter:
  // window.location.origin = https://eddiemckee112-oss.github.io
  // import.meta.env.BASE_URL = /bookie-vision/
  // appBaseUrl => https://eddiemckee112-oss.github.io/bookie-vision
  const appBaseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, "");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      passwordSchema.parse(password);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // ✅ must include /#/ for HashRouter
          emailRedirectTo: `${appBaseUrl}/#/`,
        },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Account created. Check your email if confirmation is enabled.",
      });

      // If confirmation is ON, user may not be logged in yet — still ok to go here
      navigate("/onboard");
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: orgUsers, error: orgError } = await supabase
        .from("org_users")
        .select("org_id, role")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: true });

      if (orgError) throw orgError;

      toast({
        title: "Welcome back!",
        description: "Signed in successfully.",
      });

      // If there was an invite waiting, accept it now
      const pendingToken = localStorage.getItem("pendingInviteToken");
      if (pendingToken) {
        localStorage.removeItem("pendingInviteToken");
        navigate(`/accept-invite?token=${pendingToken}`);
        return;
      }

      if (!orgUsers || orgUsers.length === 0) {
        navigate("/onboard");
      } else if (orgUsers.length === 1) {
        localStorage.setItem("currentOrgId", orgUsers[0].org_id);
        navigate("/dashboard");
      } else {
        navigate("/choose-org");
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        // ✅ must include /#/reset-password for HashRouter + GitHub pages base path
        redirectTo: `${appBaseUrl}/#/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Check your email",
        description: "If an account exists, we sent a reset link.",
      });

      setShowResetDialog(false);
      setResetEmail("");
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Kosmos Bookkeeping</CardTitle>
          <CardDescription>Manage receipts and transactions for your business</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>

                <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                  <DialogTrigger asChild>
                    <Button variant="link" className="w-full text-sm">
                      Forgot your password?
                    </Button>
                  </DialogTrigger>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset Password</DialogTitle>
                      <DialogDescription>Enter your email and we’ll send a reset link.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="you@example.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                        />
                      </div>

                      <Button type="submit" className="w-full" disabled={resetLoading}>
                        {resetLoading ? "Sending..." : "Send Reset Link"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Min 12 chars, with uppercase, lowercase, number, special char"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must include uppercase, lowercase, number, and special character
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
