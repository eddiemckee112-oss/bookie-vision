import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AppearanceSettings } from "@/components/AppearanceSettings";

interface UserOrg {
  org_id: string;
  org_name: string;
  role: "owner" | "admin" | "staff";
  created_at: string;
}

const Settings = () => {
  const { currentOrg, loading: orgLoading, switchOrg } = useOrg();
  const navigate = useNavigate();
  const [userOrgs, setUserOrgs] = useState<UserOrg[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    
    fetchUserOrgs();
  }, [currentOrg, orgLoading, navigate]);

  const fetchUserOrgs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("org_users")
      .select("org_id, role, created_at, orgs(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching user orgs:", error);
      return;
    }

    setUserOrgs(
      (data || []).map((ou: any) => ({
        org_id: ou.org_id,
        org_name: ou.orgs?.name || "Unknown",
        role: ou.role,
        created_at: ou.created_at,
      }))
    );
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);

    try {
      const { data: org, error: orgError } = await supabase.rpc("create_org", {
        _name: newOrgName,
      });

      if (orgError) throw orgError;

      toast({
        title: "Organization created!",
        description: `${newOrgName} has been created successfully.`,
      });

      setShowCreateDialog(false);
      setNewOrgName("");
      
      await fetchUserOrgs();
      
      if (org?.id) {
        localStorage.setItem("currentOrgId", org.id);
        switchOrg(org.id);
      }
    } catch (error: any) {
      toast({
        title: "Failed to create organization",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSwitchOrg = (orgId: string) => {
    localStorage.setItem("currentOrgId", orgId);
    switchOrg(orgId);
    navigate("/dashboard");
  };

  if (orgLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and organizations</p>
        </div>

        <AppearanceSettings />

        <Card>
          <CardHeader>
            <CardTitle>My Companies</CardTitle>
            <CardDescription>Manage all organizations you belong to</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {userOrgs.map((org) => (
                <div
                  key={org.org_id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    currentOrg?.id === org.org_id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">{org.org_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Role: <span className="capitalize">{org.role}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentOrg?.id === org.org_id && (
                        <Badge variant="default">Active</Badge>
                      )}
                      {currentOrg?.id !== org.org_id && (
                        <Button
                          onClick={() => handleSwitchOrg(org.org_id)}
                          variant="outline"
                          size="sm"
                        >
                          Switch to this company
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create New Company
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Organization</DialogTitle>
                  <DialogDescription>
                    Add another company to your account
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                      id="orgName"
                      type="text"
                      placeholder="Acme Inc."
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createLoading}>
                    {createLoading ? "Creating..." : "Create Organization"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
