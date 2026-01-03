import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgCategories } from "@/hooks/useOrgCategories";

interface VendorRule {
  id: string;
  vendor_pattern: string;
  category: string | null;
  tax: number | null;
  auto_match: boolean;
  source: string | null;
  direction_filter: string | null;
  created_at?: string;
}

const Rules = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rules, setRules] = useState<VendorRule[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<VendorRule | null>(null);

  // ✅ Categories now come from DB (org_categories)
  const { categories: orgCategories, loading: catsLoading, refresh: refreshCats } = useOrgCategories();

  const categoryNames = useMemo(() => {
    // guard: Radix Select dies if value is "" — so we only keep non-empty strings
    const names = orgCategories.map((c) => (c.name ?? "").trim()).filter(Boolean);

    // ensure "Uncategorized" exists and appears first
    const hasUncat = names.some((n) => n.toLowerCase() === "uncategorized");
    const merged = hasUncat ? names : ["Uncategorized", ...names];

    // de-dupe case-insensitive
    const seen = new Set<string>();
    return merged.filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [orgCategories]);

  const [formData, setFormData] = useState({
    vendor_pattern: "",
    category: "Uncategorized",
    tax: "",
    auto_match: false,
    source: "",
    direction_filter: "",
  });

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchRules();
    // also refresh categories on load so dropdown is always current
    refreshCats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, orgLoading]);

  const fetchRules = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("vendor_rules")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error fetching rules", description: error.message, variant: "destructive" });
      return;
    }

    setRules((data as VendorRule[]) || []);
  };

  const resetForm = () => {
    setFormData({
      vendor_pattern: "",
      category: "Uncategorized",
      tax: "",
      auto_match: false,
      source: "",
      direction_filter: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    const safeCategory = (formData.category ?? "").trim() || "Uncategorized";

    const ruleData = {
      org_id: currentOrg.id,
      vendor_pattern: formData.vendor_pattern.trim(),
      category: safeCategory,
      tax: formData.tax ? parseFloat(formData.tax) : null,
      auto_match: formData.auto_match,
      source: formData.source.trim() || null,
      direction_filter: formData.direction_filter.trim() || null,
    };

    try {
      if (editingRule) {
        const { error } = await supabase.from("vendor_rules").update(ruleData).eq("id", editingRule.id);
        if (error) throw error;
        toast({ title: "Rule updated successfully" });
      } else {
        const { error } = await supabase.from("vendor_rules").insert(ruleData);
        if (error) throw error;
        toast({ title: "Rule created successfully" });
      }

      setIsDialogOpen(false);
      setEditingRule(null);
      resetForm();
      fetchRules();
    } catch (error: any) {
      toast({ title: "Error saving rule", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (rule: VendorRule) => {
    setEditingRule(rule);
    setFormData({
      vendor_pattern: rule.vendor_pattern,
      category: (rule.category ?? "Uncategorized").trim() || "Uncategorized",
      tax: rule.tax?.toString() || "",
      auto_match: rule.auto_match,
      source: rule.source || "",
      direction_filter: rule.direction_filter || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    const { error } = await supabase.from("vendor_rules").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting rule", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Rule deleted successfully" });
    fetchRules();
  };

  const handleToggleAutoMatch = async (rule: VendorRule) => {
    const { error } = await supabase
      .from("vendor_rules")
      .update({ auto_match: !rule.auto_match })
      .eq("id", rule.id);

    if (error) {
      toast({ title: "Error updating rule", description: error.message, variant: "destructive" });
      return;
    }
    fetchRules();
  };

  if (orgLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Vendor Rules</h1>
            <p className="text-muted-foreground">Manage categorization rules for your transactions</p>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingRule(null);
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingRule ? "Edit Rule" : "Create New Rule"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="vendor_pattern">Vendor Pattern *</Label>
                    <Input
                      id="vendor_pattern"
                      value={formData.vendor_pattern}
                      onChange={(e) => setFormData({ ...formData, vendor_pattern: e.target.value })}
                      placeholder="e.g., WALMART, AMAZON"
                      required
                    />
                  </div>

                  <div>
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(v) => setFormData({ ...formData, category: v })}
                      disabled={catsLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={catsLoading ? "Loading categories..." : "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="tax">Tax Rate</Label>
                    <Input
                      id="tax"
                      type="number"
                      step="0.01"
                      value={formData.tax}
                      onChange={(e) => setFormData({ ...formData, tax: e.target.value })}
                      placeholder="e.g., 0.13"
                    />
                  </div>

                  <div>
                    <Label htmlFor="source">Source</Label>
                    <Input
                      id="source"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="e.g., CIBC Bank Account"
                    />
                  </div>

                  <div>
                    <Label htmlFor="direction_filter">Direction Filter</Label>
                    <Input
                      id="direction_filter"
                      value={formData.direction_filter}
                      onChange={(e) => setFormData({ ...formData, direction_filter: e.target.value })}
                      placeholder="e.g., debit, credit"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto_match"
                      checked={formData.auto_match}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_match: checked })}
                    />
                    <Label htmlFor="auto_match">Auto-match</Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingRule(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">{editingRule ? "Update" : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Pattern</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Auto-match</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No rules found. Create your first rule to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.vendor_pattern}</TableCell>
                    <TableCell>{rule.category || "-"}</TableCell>
                    <TableCell>{rule.tax ? `${(rule.tax * 100).toFixed(2)}%` : "-"}</TableCell>
                    <TableCell>{rule.source || "-"}</TableCell>
                    <TableCell>{rule.direction_filter || "-"}</TableCell>
                    <TableCell>
                      <Switch checked={rule.auto_match} onCheckedChange={() => handleToggleAutoMatch(rule)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Layout>
  );
};

export default Rules;
