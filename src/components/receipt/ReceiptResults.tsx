import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Edit2, Check, X } from "lucide-react";
import { ReceiptData } from "@/types/receipt";
import { useToast } from "@/hooks/use-toast";

interface ReceiptResultsProps {
  data: ReceiptData;
}

const ReceiptResults = ({ data }: ReceiptResultsProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<ReceiptData>(data);
  const { toast } = useToast();

  const handleExport = () => {
    const json = JSON.stringify(editedData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${editedData.vendor}-${editedData.date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Exported!",
      description: "Receipt data downloaded as JSON.",
    });
  };

  return (
    <Card className="p-6 shadow-md border-border animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Extracted Data</h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditedData(data);
                  setIsEditing(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => setIsEditing(false)}
                className="bg-gradient-to-r from-accent to-accent/90"
              >
                <Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                className="bg-gradient-to-r from-primary to-primary/90 shadow-primary"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Vendor */}
        <div>
          <Label className="text-sm font-medium text-muted-foreground">Vendor</Label>
          {isEditing ? (
            <Input
              value={editedData.vendor}
              onChange={(e) =>
                setEditedData({ ...editedData, vendor: e.target.value })
              }
              className="mt-1"
            />
          ) : (
            <p className="text-lg font-semibold text-foreground mt-1">
              {editedData.vendor}
            </p>
          )}
        </div>

        {/* Date and Amount Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Date</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedData.date}
                onChange={(e) =>
                  setEditedData({ ...editedData, date: e.target.value })
                }
                className="mt-1"
              />
            ) : (
              <p className="text-base font-medium text-foreground mt-1">
                {new Date(editedData.date).toLocaleDateString()}
              </p>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Total</Label>
            {isEditing ? (
              <Input
                type="number"
                step="0.01"
                value={editedData.total}
                onChange={(e) =>
                  setEditedData({ ...editedData, total: parseFloat(e.target.value) })
                }
                className="mt-1"
              />
            ) : (
              <p className="text-xl font-bold text-accent mt-1">
                ${editedData.total.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Optional Fields */}
        {editedData.tax !== undefined && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Subtotal</Label>
              <p className="text-base text-foreground mt-1">
                ${editedData.subtotal?.toFixed(2)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Tax</Label>
              <p className="text-base text-foreground mt-1">
                ${editedData.tax.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* Items */}
        <div>
          <Label className="text-sm font-medium text-muted-foreground mb-2 block">
            Items ({editedData.items.length})
          </Label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {editedData.items.map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty: {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  ${item.price.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Info */}
        {(editedData.category || editedData.paymentMethod) && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              {editedData.category && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    Category
                  </Label>
                  <p className="text-base text-foreground mt-1">
                    {editedData.category}
                  </p>
                </div>
              )}
              {editedData.paymentMethod && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    Payment
                  </Label>
                  <p className="text-base text-foreground mt-1">
                    {editedData.paymentMethod}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

export default ReceiptResults;
