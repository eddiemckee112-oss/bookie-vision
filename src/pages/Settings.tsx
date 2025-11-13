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
import { UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { emailSchema } from "@/lib/validations";

interface OrgMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
  email?: string;
}

const Settings = () => {
  const { currentOrg, loading: orgLoading, orgRole } = useOrg();
  const navigate = useNavigate();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    if (orgRole !== "owner" && orgRole !== "admin") {
      navigate("/dashboard");
      return;
    }
    fetchMembers();
  }, [currentOrg, orgLoading, orgRole, navigate]);

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
