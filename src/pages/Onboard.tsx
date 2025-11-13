import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { orgNameSchema } from "@/lib/validations";

const Onboard = () => {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshOrgs } = useOrg();

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate organization name
      const validatedName = orgNameSchema.parse(orgName);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from("orgs")
        .insert({ name: validatedName })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add user as owner
      const { error: userError } = await supabase
        .from("org_users")
        .insert({
          org_id: org.id,
          user_id: user.id,
          role: "owner",
        });

      if (userError) throw userError;

      toast({
        title: "Organization created!",
        description: `Welcome to ${orgName}`,
      });

      await refreshOrgs();
      navigate("/dashboard");
    } catch (error: any) {
      if (error.name === "ZodError") {
        toast({
          title: "Invalid Organization Name",
          description: error.errors[0]?.message || "Please check your input",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to create organization",
          description: "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Your Organization</CardTitle>
          <CardDescription>Set up your company to start managing finances</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboard;
