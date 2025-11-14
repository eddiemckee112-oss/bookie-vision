import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Camera, X, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";

const CATEGORIES = [
  "Uncategorized",
  "Income",
  "Bank Fees",
  "Fuel",
  "Utilities",
  "Phone/Internet",
  "Insurance",
  "Professional Fees",
  "Software",
  "Subscriptions",
  "Repairs & Maintenance",
  "Office",
  "Meals & Entertainment",
  "Travel",
  "Lodging",
  "Building Maintenance",
  "Building Miscellaneous",
  "Restaurant (Food & Supplies)",
  "Taxes",
  "Other",
];

const SOURCES = [
  "CIBC Bank Account",
  "Rogers MasterCard",
  "PC MasterCard",
  "Cash",
];

interface ReceiptFormData {
  vendor: string;
  receipt_date: Date | undefined;
  total: string;
  tax: string;
  category: string;
  source: string;
  notes: string;
}

interface ReceiptFormProps {
  onSuccess: () => void;
}

const ReceiptForm = ({ onSuccess }: ReceiptFormProps) => {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<ReceiptFormData>({
    vendor: "",
    receipt_date: undefined,
    total: "",
    tax: "",
    category: "Uncategorized",
    source: SOURCES[0],
    notes: "",
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setFormData({
      vendor: "",
      receipt_date: undefined,
      total: "",
      tax: "",
      category: "Uncategorized",
      source: SOURCES[0],
      notes: "",
    });
  };

  const handleScanWithAI = async () => {
    if (!selectedFile || !currentOrg) return;

    setIsScanning(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onloadend = async () => {
        const base64String = reader.result as string;

        try {
          // Call AI suggest function with base64 image
          const { data, error } = await supabase.functions.invoke("ai-suggest", {
            body: {
              image: base64String,
              hint_vendor: formData.vendor,
              hint_amount: formData.total,
              hint_date: formData.receipt_date?.toISOString(),
              source: formData.source,
            },
          });

          if (error) throw error;

          // Apply suggestions to form, only filling empty fields
          if (data.vendor && !formData.vendor) setFormData(prev => ({ ...prev, vendor: data.vendor }));
          if (data.date && !formData.receipt_date) setFormData(prev => ({ ...prev, receipt_date: new Date(data.date) }));
          if (data.total && !formData.total) setFormData(prev => ({ ...prev, total: data.total.toString() }));
          if (data.tax && !formData.tax) setFormData(prev => ({ ...prev, tax: data.tax.toString() }));
          if (data.category && formData.category === "Uncategorized") setFormData(prev => ({ ...prev, category: data.category }));
          if (data.source && !formData.source) setFormData(prev => ({ ...prev, source: data.source }));
          if (data.notes && !formData.notes) setFormData(prev => ({ ...prev, notes: data.notes }));

          toast({
            title: "AI Scan Complete",
            description: "Receipt data extracted successfully. Please review and edit as needed.",
          });
        } catch (error: any) {
          console.error("AI scan error:", error);
          toast({
            title: "AI Scan Failed",
            description: error.message || "Failed to scan receipt with AI. Please enter details manually.",
            variant: "destructive",
          });
        } finally {
          setIsScanning(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Failed to read file",
          variant: "destructive",
        });
        setIsScanning(false);
      };
    } catch (error: any) {
      console.error("AI scan error:", error);
      toast({
        title: "AI Scan Failed",
        description: error.message || "Failed to scan receipt with AI. Please enter details manually.",
        variant: "destructive",
      });
      setIsScanning(false);
    }
  };

  const handleUploadReceipt = async () => {
    if (!currentOrg) return;

    // Validation
    if (!formData.vendor.trim()) {
      toast({ title: "Vendor is required", variant: "destructive" });
      return;
    }
    if (!formData.receipt_date) {
      toast({ title: "Date is required", variant: "destructive" });
      return;
    }
    if (!formData.total || parseFloat(formData.total) <= 0) {
      toast({ title: "Valid total amount is required", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      let imageUrl = null;

      // Upload file if exists
      if (selectedFile) {
        const timestamp = Date.now();
        const fileExt = selectedFile.name.split('.').pop();
        const filePath = `${currentOrg.id}/${timestamp}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, selectedFile);

        if (!uploadError) {
          imageUrl = filePath;
        }
      }

      // Insert receipt
      const { error } = await supabase.from("receipts").insert({
        org_id: currentOrg.id,
        vendor: formData.vendor.trim(),
        receipt_date: format(formData.receipt_date, "yyyy-MM-dd"),
        total: parseFloat(formData.total),
        tax: formData.tax ? parseFloat(formData.tax) : 0,
        category: formData.category,
        source: formData.source,
        notes: formData.notes.trim() || null,
        image_url: imageUrl,
      });

      if (error) throw error;

      toast({
        title: "Receipt Uploaded",
        description: "Receipt saved successfully",
      });

      handleClear();
      onSuccess();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload receipt",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload Section */}
      <div className="space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
        >
          <input {...getInputProps()} accept="image/*,application/pdf" capture="environment" />
          
          {preview ? (
            <div className="space-y-4">
              <img
                src={preview}
                alt="Receipt preview"
                className="max-h-48 mx-auto rounded-lg object-contain"
              />
              <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {isDragActive ? (
                <Upload className="mx-auto h-12 w-12 text-primary" />
              ) : (
                <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
              )}
              <div>
                <p className="text-lg font-medium">
                  {isDragActive ? "Drop your receipt here" : "Upload Receipt Image or PDF"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Drag & drop, click to browse, or use camera
                </p>
              </div>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="flex gap-2">
            <Button onClick={handleScanWithAI} disabled={isScanning} variant="outline" className="flex-1">
              <Sparkles className="mr-2 h-4 w-4" />
              {isScanning ? "Scanning..." : "Scan with AI"}
            </Button>
            <Button onClick={handleClear} variant="outline" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vendor">Vendor *</Label>
          <Input
            id="vendor"
            value={formData.vendor}
            onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
            placeholder="Enter vendor name"
          />
        </div>

        <div className="space-y-2">
          <Label>Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !formData.receipt_date && "text-muted-foreground"
                )}
              >
                {formData.receipt_date ? format(formData.receipt_date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={formData.receipt_date}
                onSelect={(date) => setFormData(prev => ({ ...prev, receipt_date: date }))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="total">Total *</Label>
          <Input
            id="total"
            type="number"
            step="0.01"
            value={formData.total}
            onChange={(e) => setFormData(prev => ({ ...prev, total: e.target.value }))}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tax">Tax</Label>
          <Input
            id="tax"
            type="number"
            step="0.01"
            value={formData.tax}
            onChange={(e) => setFormData(prev => ({ ...prev, tax: e.target.value }))}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="source">Source</Label>
          <Select value={formData.source} onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((src) => (
                <SelectItem key={src} value={src}>{src}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Additional notes..."
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleUploadReceipt} disabled={isUploading} className="flex-1">
          {isUploading ? "Uploading..." : "Upload Receipt"}
        </Button>
        <Button onClick={handleClear} variant="outline">Clear</Button>
      </div>
    </div>
  );
};

export default ReceiptForm;
