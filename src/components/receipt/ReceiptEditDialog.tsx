import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgCategories } from "@/hooks/useOrgCategories";

type Account = { id: string; name: string; type: string | null };

interface Receipt {
  id: string;
  vendor: string;
  receipt_date: string;
  total: number;
  tax: number;
  category: string | null;
  source: string | null;
  notes: string | null;
}

interface ReceiptEditDialogProps {
  receipt: Receipt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ReceiptEditDialog = ({ receipt, open, onOpenChange, onSuccess }: ReceiptEditDialogProps) => {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const { categories: orgCats, loading: catsLoading } = useOrgCategories();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const categoryNames = useMemo(() => {
    const names = orgCats.map((c) => (c.name || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(names));
    if (!uniq.includes("Uncategorized")) uniq.unshift("Uncategorized");
    return uniq;
  }, [orgCats]);

  const normalizeCategory = (raw: any): string => {
    const list = categoryNames;
    if (!raw || typeof raw !== "string") return "Uncategorized";
    const s = raw.trim();
    if (!s) return "Uncategorized";
    const exact = list.find((c) => c.toLowerCase() === s.toLowerCase());
    if (exact) return exact;
    return "Uncategorized";
  };

  useEffect(() => {
    const run = async () => {
      if (!currentOrg) return;
      setAccountsLoading(true);

      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type")
        .eq("org_id", currentOrg.id)
        .order("name", { ascending: true });

      setAccountsLoading(false);
      if (error) {
        console.error("Failed to fetch accounts:", error);
        return;
      }
      setAccounts((data as Account[]) ?? []);
    };

    run();
  }, [currentOrg?.id]);

  const defaultSource = useMemo(() => {
    const cash = accounts.find((a) => a.name?.toLowerCase().includes("cash"));
    return cash?.name || accounts[0]?.name || "";
  }, [accounts]);

  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [total, setTotal] = useState("");
  const [tax, setTax] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (!receipt) {
      setVendor("");
      setDate(undefined);
      setTotal("");
      setTax("");
      setCategory("Uncategorized");
      setSource(defaultSource || "");
      setNotes("");
      return;
    }

    setVendor(receipt.vendor ?? "");
    setDate(receipt.receipt_date ? new Date(receipt.receipt_date) : undefined);
    setTotal(receipt.total !== null && receipt.total !== undefined ? String(receipt.total) : "");
    setTax(receipt.tax !== null && receipt.tax !== undefined ? String(receipt.tax) : "");
    setCategory(normalizeCategory(receipt.category || "Uncategorized"));
    setSource(receipt.source || defaultSource || "");
    setNotes(receipt.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, open, defaultSource]);

  const handleSave = async () => {
    if (!receipt || !date) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("receipts")
        .update({
          vendor: vendor.trim(),
          receipt_date: format(date, "yyyy-MM-dd"),
          total: parseFloat(total),
          tax: parseFloat(tax) || 0,
          category: normalizeCategory(category),
          source: source || null,
          notes: notes.trim() || null,
        })
        .eq("id", receipt.id);

      if (error) throw error;

      toast({ title: "Receipt updated successfully" });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Failed to update receipt",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const accountNames = accounts.map((a) => (a.name || "").trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Receipt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-vendor">Vendor *</Label>
            <Input id="edit-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-total">Total *</Label>
              <Input id="edit-total" type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tax">Tax</Label>
              <Input id="edit-tax" type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder={catsLoading ? "Loading categories..." : "Choose a category"} />
              </SelectTrigger>
              <SelectContent>
                {categoryNames.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source || ""} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Choose source"} />
              </SelectTrigger>
              <SelectContent>
                {accountNames.length === 0 ? (
                  <SelectItem value="Cash">Cash</SelectItem>
                ) : (
                  accountNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !receipt || !date}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptEditDialog;
