import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrgOption {
  org_id: string;
  role: "owner" | "admin" | "staff";
  org_name: string;
}

const ChooseOrg = () => {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserOrgs();
  }, []);

  const fetchUserOrgs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: orgUsers, error } = await supabase
        .from("org_users")
        .select("org_id, role, orgs(id, name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const orgOptions = orgUsers?.map((ou: any) => ({
        org_id: ou.org_id,
        role: ou.role,
        org_name: ou.orgs?.name || "Unknown",
      })) || [];

      setOrgs(orgOptions);

      // If somehow we end up here with 0 or 1 orgs, redirect
      if (orgOptions.length === 0) {
        navigate("/onboard");
      } else if (orgOptions.length === 1) {
        localStorage.setItem("currentOrgId", orgOptions[0].org_id);
        navigate("/dashboard");
      } else {
        setSelectedOrgId(orgOptions[0].org_id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load organizations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!selectedOrgId) {
      toast({
        title: "No organization selected",
        description: "Please select an organization to continue",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem("currentOrgId", selectedOrgId);
    navigate("/dashboard");
  };

  const handleCreateNew = () => {
    navigate("/onboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
        <p className="text-muted-foreground">Loading organizations...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Choose an Organization</CardTitle>
          <CardDescription>Select which company you'd like to work with</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {orgs.map((org) => (
              <button
                key={org.org_id}
                onClick={() => setSelectedOrgId(org.org_id)}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  selectedOrgId === org.org_id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold">{org.org_name}</p>
                      <p className="text-sm text-muted-foreground capitalize">Role: {org.role}</p>
                    </div>
                  </div>
                  <Badge variant={org.role === "owner" ? "default" : "secondary"}>
                    {org.role}
                  </Badge>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleContinue} className="flex-1">
              Continue to Dashboard
            </Button>
            <Button onClick={handleCreateNew} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create New Company
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChooseOrg;
