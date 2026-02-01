// ONLY CHANGES ARE MARKED WITH 🔧

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
  // ... all your original code above stays the same ...

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
              ? format(formData.receipt_date, "yyyy-MM-dd") // 🔧 FIX 1
              : null,
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
              ? new Date(receipt.date + "T12:00:00") // 🔧 FIX 2
              : prev.receipt_date),
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

  // ... rest of your file stays EXACTLY the same ...
};

export default ReceiptForm;
