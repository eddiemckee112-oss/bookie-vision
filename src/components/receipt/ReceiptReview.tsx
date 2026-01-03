import { useMemo, useState } from "react";
import { ReceiptData } from "@/types/receipt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgCategories } from "@/hooks/useOrgCategories";

interface ReceiptReviewProps {
  data: ReceiptData & { imageUrl?: string };
  onConfirm: (data: ReceiptData & { imageUrl?: string }) => void;
  onCancel: () => void;
}

const ReceiptReview = ({ data, onConfirm, onCancel }: ReceiptReviewProps) => {
  const [editedData, setEditedData] = useState(data);

  const { categories: orgCategories, loading: categoriesLoading } = useOrgCategories();

  const categoryOptions = useMemo(() => {
    const names = (orgCategories ?? []).map((c) => c.name).filter(Boolean);
    if (!names.includes("Uncategorized")) names.unshift("Uncategorized");
    return names;
  }, [orgCategories]);

  const handleChange = (field: keyof ReceiptData, value: any) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  // Keep category valid if AI gave something weird
  const currentCategory = useMemo(() => {
    const incoming = (editedData.category || "Uncategorized").trim();
    return categoryOptions.includes(incoming) ? incoming : "Uncategorized";
  }, [editedData.category, categoryOptions]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold">Review Receipt Data</h3>
          <p className="text-sm text-muted-foreground">Please verify the extracted information before saving</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label htmlFor="vendor">Vendor</Label>
          <Input
            id="vendor"
            value={editedData.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={editedData.date}
            onChange={(e) => handleChange("date", e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="total">Total</Label>
          <Input
            id="total"
            type="number"
            step="0.01"
            value={editedData.total}
            onChange={(e) => handleChange("total", parseFloat(e.target.value))}
          />
        </div>

        <div>
          <Label htmlFor="tax">Tax</Label>
          <Input
            id="tax"
            type="number"
            step="0.01"
            value={editedData.tax || 0}
            onChange={(e) => handleChange("tax", parseFloat(e.target.value))}
          />
        </div>

        <div>
          <Label>Category</Label>
          <Select
            value={currentCategory}
            onValueChange={(v) => handleChange("category", v)}
            disabled={categoriesLoading || categoryOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={categoriesLoading ? "Loading categories..." : "Select category"} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="paymentMethod">Payment Method</Label>
          <Input
            id="paymentMethod"
            value={editedData.paymentMethod || ""}
            onChange={(e) => handleChange("paymentMethod", e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onConfirm({
              ...editedData,
              category: currentCategory,
            })
          }
        >
          Save Receipt
        </Button>
      </div>
    </Card>
  );
};

export default ReceiptReview;
