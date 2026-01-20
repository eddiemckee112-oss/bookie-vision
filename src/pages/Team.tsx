import { useEffect, useMemo, useState } from "react";
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
import { UserPlus, Trash2, Copy } from "lucide-react";
import { emailSchema } from "@/lib/validations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TeamMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
  email: string;
  created_at: string;
}

type AddOrgUserResponse = {
  success: boolean;
  error?: string;
  details?: string;
  created_user?: boolean;
  already_member?: boolean;
  email?: string;
  user_id?: string;
  role?: "staff" | "admin";
  temp_password?: string | null;
  note?: string;
};

const Team = () => {
  const { currentOrg, loading: orgLoading, orgRole, user } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "admin">("staff");
  const [loading, setLoading] = useState(false);

  // Temp password dialog
  const [showTemp, setShowTemp] = useState(false);
  const [tempEmail, setTempEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  // Remove confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ memberId: string; memberUserId: string; email: string } | null>(null);

  const canManage = useMemo(() => orgRole === "owner" || orgRole === "admin", [orgRole]);
  const isOwner = useMemo(() => orgRole === "owner", [orgRole]);

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, orgLoading]);

  const fetchMembers = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("org_users")
      .select(`id, user_id, role, email, created_at`)
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: "Failed to load team members", variant: "destructive" });
      return;
    }

    setMembers(
      (data || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        email: m.email || "Unknown",
      }))
    );
  };

  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !canManage) return;

    setLoading(true);
    try {
      const validatedEmail = emailSchema.parse(inviteEmail);

      const { data, error } = await supabase.functions.invoke<AddOrgUserResponse>("add-org-user", {
        body: {
          orgId: currentOrg.id,
          email: validatedEmail,
          role: inviteRole,
        },
      });

      if (error) throw new Error(error.message || "Edge Function failed");
      if (!data?.success) throw new Error(data?.error || data?.details || "Failed to add employee");

      // ✅ If we created a new user, show temp password once
      if (data.created_user && data.temp_password) {
        setTempEmail(validatedEmail);
        setTempPassword(data.temp_password);
        setShowTemp(true);
        toast({
          title: "Employee added!",
          description: "Temp password generated. Copy it and send it to them.",
        });
      } else {
        // Existing user case
        toast({
          title: "Employee added!",
          description: "This email already has an account. They can log in normally. If they forgot password, use Password Reset.",
        });
      }

      setInviteEmail("");
      setInviteRole("staff");
      await fetchMembers();
    } catch (err: any) {
      toast({
        title: "Add employee failed",
        description: err.message || "Failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const requestRemoveMember = (memberId: string, memberUserId: string, email: string) => {
    setPendingRemove({ memberId, memberUserId, email });
    setConfirmOpen(true);
  };

  const removeMember = async () => {
    if (!pendingRemove || !currentOrg) return;

    const { memberId, memberUserId } = pendingRemove;

    // Owner-only removal (matches your previous logic)
    if (!isOwner) {
      toast({ title: "Permission denied", description: "Only owners can remove members", variant: "destructive" });
      setConfirmOpen(false);
      setPendingRemove(null);
      return;
    }

    if (memberUserId === user?.id) {
      toast({ title: "Cannot remove yourself", description: "You cannot remove yourself from the organization", variant: "destructive" });
      setConfirmOpen(false);
      setPendingRemove(null);
      return;
    }

    const { error } = await supabase
      .from("org_users")
      .delete()
      .eq("id", memberId)
      .eq("org_id", currentOrg.id);

    if (error) {
      toast({ title: "Error", description: "Failed to remove member", variant: "destructive" });
      setConfirmOpen(false);
      setPendingRemove(null);
      return;
    }

    toast({ title: "Member removed" });
    setConfirmOpen(false);
    setPendingRemove(null);
    fetchMembers();
  };

  const updateMemberRole = async (memberId: string, memberUserId: string, newRole: "admin" | "staff") => {
    if (!canManage || !currentOrg) return;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (member.user_id === user?.id) {
      toast({ title: "Cannot modify yourself", description: "You cannot change your own role", variant: "destructive" });
      return;
    }

    if (!isOwner && member.role === "owner") {
      toast({ title: "Permission denied", description: "Only owners can modify owner roles", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("org_users")
      .update({ role: newRole })
      .eq("id", memberId)
      .eq("org_id", currentOrg.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update role", variant: "destructive" });
      return;
    }

    toast({ title: "Role updated" });
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
          <p className="text-muted-foreground">Add/remove employees for {currentOrg?.name}</p>
        </div>

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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => requestRemoveMember(member.id, member.user_id, member.email)}
                            title="Remove member"
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

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Add Employee</CardTitle>
              <CardDescription>Creates their account (if needed) and adds them to this company</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addEmployee} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="employee@kosmos.com"
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
                <Button type="submit" disabled={loading}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {loading ? "Adding..." : "Add Employee"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Temp password dialog */}
        <Dialog open={showTemp} onOpenChange={setShowTemp}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Employee Temp Password</DialogTitle>
              <DialogDescription>
                Copy this and send it to them. They can log in and change it right away.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium">Email</div>
                <div className="p-2 rounded bg-muted break-all">{tempEmail}</div>
              </div>

              <div className="text-sm">
                <div className="font-medium">Temp Password</div>
                <div className="p-2 rounded bg-muted break-all">{tempPassword}</div>
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${tempEmail}\nPassword: ${tempPassword}`);
                  toast({ title: "Copied", description: "Login details copied to clipboard" });
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Login Details
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm remove */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove employee?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingRemove ? `Remove ${pendingRemove.email} from this company?` : "Remove this user?"}
                <br />
                This only removes them from this company — it does not delete their account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingRemove(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={removeMember}>Yes, remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default Team;
