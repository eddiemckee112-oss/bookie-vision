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
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Copy, XCircle } from "lucide-react";
import { emailSchema } from "@/lib/validations";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TeamMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
  email: string;
  created_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: "admin" | "staff" | "owner";
  status: string;
  token: string | null;
  created_at: string;
}

const Team = () => {
  const { currentOrg, loading: orgLoading, orgRole, user } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
  const [inviteLoading, setInviteLoading] = useState(false);

  // kept (but we won’t force showing the link anymore)
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const canManage = orgRole === "owner" || orgRole === "admin";
  const isOwner = orgRole === "owner";

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    fetchMembers();
    fetchInvites();
  }, [currentOrg, orgLoading, navigate]);

  const fetchMembers = async () => {
    if (!currentOrg) return;

    // ✅ Pull email directly from org_users (after the SQL backfill + trigger)
    const { data, error } = await supabase
      .from("org_users")
      .select(
        `
        id,
        user_id,
        role,
        email,
        created_at
      `,
      )
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: true });

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
        created_at: m.created_at,
        email: m.email || "Unknown",
      })),
    );
  };

  const fetchInvites = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("org_invites")
      .select("id, email, role, status, created_at, token")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invites:", error);
      return;
    }

    setInvites(data || []);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !canManage) return;

    setInviteLoading(true);
    try {
      const validatedEmail = emailSchema.parse(inviteEmail);

      // ✅ Call Edge Function that:
      // 1) inserts org_invites (token default)
      // 2) sends Supabase Auth invite email
      const { data, error } = await supabase.functions.invoke("send-org-invite", {
        body: {
          orgId: currentOrg.id,
          email: validatedEmail,
          role: inviteRole,
          invitedBy: user?.id ?? null,
          origin: window.location.origin,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to send invite email");
      }

      toast({
        title: "Invite sent!",
        description: `Supabase emailed an invite to ${validatedEmail}`,
      });

      // Optional: if you still want a backup link for YOU only, you can keep it:
      // (but you said you don’t want to send links, so we keep dialog OFF by default)
      setInviteLink("");
      setShowInviteLink(false);

      setInviteEmail("");
      setInviteRole("staff");
      fetchInvites();
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
          description: error.message || "Failed to create invitation",
          variant: "destructive",
        });
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = (token: string | null) => {
    if (!token) {
      toast({
        title: "No token found",
        description: "This invite is missing a token.",
        variant: "destructive",
      });
      return;
    }

    const link = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied!",
      description: "Invite link copied to clipboard",
    });
  };

  const revokeInvite = async (inviteId: string) => {
    const { error } = await supabase.from("org_invites").update({ status: "revoked" }).eq("id", inviteId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to revoke invite",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Invite revoked" });
    fetchInvites();
  };

  const updateMemberRole = async (memberId: string, memberUserId: string, newRole: "admin" | "staff") => {
    if (!canManage) return;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (member.user_id === user?.id) {
      toast({
        title: "Cannot modify yourself",
        description: "You cannot change your own role",
        variant: "destructive",
      });
      return;
    }

    if (!isOwner && member.role === "owner") {
      toast({
        title: "Permission denied",
        description: "Only owners can modify owner roles",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("org_users")
      .update({ role: newRole })
      .eq("id", memberId)
      .eq("org_id", currentOrg?.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update role",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Role updated" });
    fetchMembers();
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    if (!isOwner) {
      toast({
        title: "Permission denied",
        description: "Only owners can remove members",
        variant: "destructive",
      });
      return;
    }

    if (memberUserId === user?.id) {
      toast({
        title: "Cannot remove yourself",
        description: "You cannot remove yourself from the organization",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("org_users").delete().eq("id", memberId).eq("org_id", currentOrg?.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Member removed" });
    fetchMembers();
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
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage members and invitations for {currentOrg?.name}</p>
        </div>

        {/* Current Team Members */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "member" : "members"} in your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Member Since</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {canManage && member.user_id !== user?.id && member.role !== "owner" ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => updateMemberRole(member.id, member.user_id, value as "admin" | "staff")}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(member.created_at).toLocaleDateString()}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {isOwner && member.role !== "owner" && member.user_id !== user?.id && (
                          <Button variant="ghost" size="icon" onClick={() => removeMember(member.id, member.user_id)}>
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

        {/* Pending Invites */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites</CardTitle>
            <CardDescription>Invitations waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{invite.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invite.status === "pending"
                              ? "default"
                              : invite.status === "accepted"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {invite.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {invite.status === "pending" && (
                              <>
                                {/* optional fallback: copy link */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyInviteLink(invite.token)}
                                  title="Copy invite link (fallback)"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => revokeInvite(invite.id)}
                                  title="Revoke invite"
                                >
                                  <XCircle className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Invite Form */}
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Invite New Member</CardTitle>
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
                    <Select value={inviteRole} onValueChange={(value: "staff" | "admin") => setInviteRole(value)}>
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
                <Button type="submit" disabled={inviteLoading}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {inviteLoading ? "Sending invite..." : "Send Email Invite"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Invite Link Dialog (kept but not used by default anymore) */}
        <Dialog open={showInviteLink} onOpenChange={setShowInviteLink}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invitation Link Created</DialogTitle>
              <DialogDescription>
                Backup link (only if needed). Normally invites are sent by email now.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md break-all text-sm">{inviteLink}</div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  toast({ title: "Copied!", description: "Invite link copied to clipboard" });
                }}
                className="w-full"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Team;
