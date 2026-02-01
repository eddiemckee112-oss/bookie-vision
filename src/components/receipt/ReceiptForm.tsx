import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Camera, X, Sparkles, FileUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgCategories } from "@/hooks/useOrgCategories";

const BUCKET = "receipts-warm";

type Account = { id: string; name: string; type: string | null };

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
  const { categories: orgCats, loading: catsLoading } = useOrgCategories();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categoryNames = useMemo(() => {
    const names = orgCats.map((c) => (c.name || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(names));
    if (!uniq.includes("Uncategorized")) uniq.unshift("Uncategorized");
    return uniq;
  }, [orgCats]);

  const defaultSource = useMemo(() => {
    const cash = accounts.find((a) => a.name?.toLowerCase().includes("cash"));
    return cash?.name || accounts[0]?.name || "";
  }, [accounts]);

  const [formData, setFormData] = useState<ReceiptFormData>({
    vendor: "",
    receipt_date: undefined,
    total: "",
    tax: "",
    category: "Uncategorized",
    source: "",
    notes: "",
  });

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

      if (error) return;
      setAccounts((data as Account[]) ?? []);
    };

    run();
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!formData.source && defaultSource) {
      setFormData((p) => ({ ...p, source: defaultSource }));
    }
  }, [defaultSource]);

  const normalizeCategory = useCallback(
    (raw: any): string => {
      const list = categoryNames;
      if (!raw || typeof raw !== "string") return "Uncategorized";
      const s = raw.trim();
      if (!s) return "Uncategorized";

      const exact = list.find((c) => c.toLowerCase() === s.toLowerCase());
      if (exact) return exact;

      const lower = s.toLowerCase();
      const map: Array<{ test: (x: string) => boolean; to: string }> = [
        { test: (x) => x.includes("food") || x.includes("beverage") || x.includes("restaurant (food") || x.includes("supplies"), to: "Food & Supplies" },
        { test: (x) => x.includes("clean"), to: "Cleaning Supplies" },
        { test: (x) => x.includes("tool") || x.includes("equipment"), to: "Tools & Equipment" },
        { test: (x) => x.includes("repair") || x.includes("maintenance"), to: "Repairs & Maintenance" },
        { test: (x) => x.includes("utilit"), to: "Utilities" },
        { test: (x) => x.includes("bank fee") || x.includes("interest"), to: "Bank Fees & Interest" },
        { test: (x) => x.includes("advert") || x.includes("marketing"), to: "Advertising & Marketing" },
        { test: (x) => x.includes("software") || x.includes("subscription"), to: "Software & Subscriptions" },
        { test: (x) => x.includes("insur"), to: "Insurance" },
        { test: (x) => x.includes("tax"), to: "Taxes" },
        { test: (x) => x.includes("income") || x.includes("sales"), to: "Sales Income" },
        { test: (x) => x.includes("owner") || x.includes("personal"), to: "Owner / Personal" },
        { test: (x) => x.includes("building"), to: "Building Supplies" },
      ];

      for (const m of map) {
        if (m.test(lower)) {
          const found = list.find((c) => c.toLowerCase() === m.to.toLowerCase());
          if (found) return found;
        }
      }

      return "Uncategorized";
    },
    [categoryNames],
  );

  const setFile = useCallback((file: File) => {
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setFile(file);
  }, [setFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  const onPickFromInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFile(file);
      e.target.value = "";
    },
    [setFile],
  );

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setFormData({
      vendor: "",
      receipt_date: undefined,
      total: "",
      tax: "",
      category: "Uncategorized",
      source: defaultSource || "",
      notes: "",
    });
  };

  const handleScanWithAI = async () => {
    if (!selectedFile || !currentOrg) return;
    setIsScanning(true);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);

    reader.onloadend = async () => {
      const base64String = reader.result as string;

      try {
        const { data, error } = await supabase.functions.invoke("process-receipt", {
          body: {
            image: base64String,
            hint_vendor: formData.vendor,
            hint_amount: formData.total,
            hint_date: formData.receipt_date
              ? format(formData.receipt_date, "yyyy-MM-dd")
              : null, // 🔧 FIX 1
            source: formData.source,
          },
        });

        if (error) throw error;

        const receipt = (data as any)?.receiptData ?? (data as any) ?? {};
        const aiCategory = normalizeCategory(receipt.category);

        setFormData((prev) => ({
          ...prev,
          vendor: prev.vendor || receipt.vendor || "",
          receipt_date:
            prev.receipt_date ||
            (receipt.date
              ? new Date(receipt.date + "T12:00:00")
              : prev.receipt_date), // 🔧 FIX 2
          total: prev.total || (receipt.total != null ? String(receipt.total) : prev.total),
          tax: prev.tax || (receipt.tax != null ? String(receipt.tax) : prev.tax),
          category: prev.category && prev.category !== "Uncategorized" ? prev.category : aiCategory,
          source: prev.source || receipt.source || prev.source,
          notes: prev.notes || receipt.notes || prev.notes,
        }));

        toast({
          title: "AI Scan Complete",
          description: "Receipt data extracted. Category was clamped to your org list.",
        });
      } catch (err: any) {
        console.error("AI scan error:", err);
        toast({
          title: "AI Scan Failed",
          description: err?.message || "Failed to scan receipt with AI.",
          variant: "destructive",
        });
      } finally {
        setIsScanning(false);
      }
    };

    reader.onerror = () => {
      toast({ title: "Failed to read file", variant: "destructive" });
      setIsScanning(false);
    };
  };

  const handleUploadReceipt = async () => {
    if (!currentOrg) return;

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
      let imageUrl: string | null = null;

      if (selectedFile) {
        const timestamp = Date.now();
        const fileExt = selectedFile.name.split(".").pop();
        const filePath = `${currentOrg.id}/${timestamp}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, selectedFile);
        if (!uploadError) imageUrl = filePath;
      }

      const safeCategory = normalizeCategory(formData.category);

      const { error } = await supabase.from("receipts").insert({
        org_id: currentOrg.id,
        vendor: formData.vendor.trim(),
        receipt_date: format(formData.receipt_date, "yyyy-MM-dd"),
        total: parseFloat(formData.total),
        tax: formData.tax ? parseFloat(formData.tax) : 0,
        category: safeCategory,
        source: formData.source || null,
        notes: formData.notes.trim() || null,
        image_url: imageUrl,
      });

      if (error) throw error;

      toast({ title: "Receipt Uploaded", description: "Saved successfully" });
      handleClear();
      onSuccess();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Upload Failed",
        description: err?.message || "Failed to upload receipt",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickFromInput}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onPickFromInput}
        />

        <Button type="button" className="flex-1" onClick={() => cameraInputRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />
          Take Photo
        </Button>

        <Button type="button" variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
          <FileUp className="mr-2 h-4 w-4" />
          Choose File
        </Button>
      </div>

      <div className="space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
        >
          <input {...getInputProps()} accept="image/*,application/pdf" />

          {preview ? (
            <div className="space-y-4">
              <img src={preview} alt="Receipt preview" className="max-h-48 mx-auto rounded-lg object-contain" />
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
                <p className="text-sm text-muted-foreground">Drag & drop, or click to browse</p>
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
            <Button onClick={handleClear} variant="outline" size="icon" title="Clear">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* form fields unchanged */}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleUploadReceipt} disabled={isUploading} className="flex-1">
          {isUploading ? "Uploading..." : "Upload Receipt"}
        </Button>
        <Button onClick={handleClear} variant="outline">
          Clear
        </Button>
      </div>
    </div>
  );
};

export default ReceiptForm;
