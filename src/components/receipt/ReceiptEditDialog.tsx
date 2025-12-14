import { useEffect, useState } from "react";
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

const CATEGORIES = [
  "Uncategorized", "Income", "Bank Fees", "Fuel", "Utilities", "Phone/Internet",
  "Insurance", "Professional Fees", "Software", "Subscriptions", "Repairs & Maintenance",
  "Office", "Meals & Entertainment", "Travel", "Lodging", "Building Maintenance",
  "Building Miscellaneous", "Restaurant (Food & Supplies)", "Taxes", "Other",
];

const SOURCES = ["CIBC Bank Account", "Rogers MasterCard", "PC MasterCard", "Cash"];

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

  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [total, setTotal] = useState("");
  const [tax, setTax] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [source, setSource] = useState(SOURCES[0]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ✅ THIS is the fix: when a new receipt is chosen for editing, populate the form.
  useEffect(() => {
    if (!open) return;

    if (!receipt) {
      setVendor("");
      setDate(undefined);
      setTotal("");
      setTax("");
      setCategory("Uncategorized");
      setSource(SOURCES[0]);
      setNotes("");
      return;
    }

    setVendor(receipt.vendor ?? "");
    setDate(receipt.receipt_date ? new Date(receipt.receipt_date) : undefined);
    setTotal(receipt.total !== null && receipt.total !== undefined ? String(receipt.total) : "");
    setTax(receipt.tax !== null && receipt.tax !== undefined ? String(receipt.tax) : "");
    setCategory(receipt.category || "Uncategorized");
    setSource(receipt.source || SOURCES[0]);
    setNotes(receipt.notes || "");
  }, [receipt, open]);

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
          category,
          source,
          notes: notes.trim() || null,
        })
        .eq("id", receipt.id);

      if (error) throw error;

      toast({ title: "Receipt updated successfully" });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Failed to update receipt",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Receipt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-vendor">Vendor *</Label>
            <Input
              id="edit-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Enter vendor name"
            />
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
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-total">Total *</Label>
              <Input
                id="edit-total"
                type="number"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tax">Tax</Label>
              <Input
                id="edit-tax"
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>{src}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
