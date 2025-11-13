import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Trash2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { emailSchema } from "@/lib/validations";

interface OrgMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
  email?: string;
}

interface UserOrg {
  org_id: string;
  org_name: string;
  role: "owner" | "admin" | "staff";
  created_at: string;
}

const Settings = () => {
  const { currentOrg, loading: orgLoading, orgRole, orgs, switchOrg } = useOrg();
  const navigate = useNavigate();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
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
    
    // Server-side role verification
    const verifyRole = async () => {
      const { data: hasAccess } = await supabase.rpc("has_min_role", {
        _user_id: (await supabase.auth.getUser()).data.user?.id,
        _org_id: currentOrg.id,
        _min_role: "admin",
      });

      if (!hasAccess) {
        navigate("/dashboard");
        return;
      }
      
      fetchMembers();
    };

    // Client-side check for immediate UX (server-side is authoritative)
    if (orgRole !== "owner" && orgRole !== "admin") {
      navigate("/dashboard");
      return;
    }
    
    verifyRole();
    fetchUserOrgs();
  }, [currentOrg, orgLoading, orgRole, navigate]);

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

  const fetchMembers = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("org_users")
      .select(`
        id,
        user_id,
        role,
        user:user_id (email)
      `)
      .eq("org_id", currentOrg.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      });
      return;
    }

    setMembers(
      (data || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        email: m.user?.email || "Unknown",
      }))
    );
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    try {
      // Validate email
      const validatedEmail = emailSchema.parse(inviteEmail);

      const { error } = await supabase.from("org_invites").insert({
        org_id: currentOrg.id,
        email: validatedEmail,
        role: inviteRole,
        invited_by: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) throw error;

      toast({
        title: "Invite sent!",
        description: `Invitation sent to ${validatedEmail}`,
      });

      setInviteEmail("");
      setInviteRole("staff");
    } catch (error: any) {
      if (error.name === "ZodError") {
        toast({
          title: "Invalid Email",
          description: error.errors[0]?.message || "Please enter a valid email address",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Invite failed",
          description: "Failed to send invitation",
          variant: "destructive",
        });
      }
    }
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
      
      // Refresh the orgs list
      await fetchUserOrgs();
      
      // Switch to the new org
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

  const removeMember = async (memberId: string) => {
    const { error } = await supabase.from("org_users").delete().eq("id", memberId);

    if (error) {
      toast({
        title: "Remove failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Member removed" });
    fetchMembers();
  };

  const canManage = orgRole === "owner" || orgRole === "admin";

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your organization</p>
        </div>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
              <CardDescription>Send an invitation to join your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={sendInvite} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Send Invite
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

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

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>People in your organization</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {orgRole === "owner" && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    {orgRole === "owner" && (
                      <TableCell className="text-right">
                        {member.role !== "owner" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMember(member.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
