import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CSVUploaderProps {
  orgId: string;
  accountId?: string; // optional default
  onUploadComplete: () => void;
}

type AccountRow = {
  id: string;
  name: string;
  type: string | null;
  currency: string | null;
};

const CSVUploader = ({ orgId, accountId, onUploadComplete }: CSVUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accountId ?? "");

  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const loadAccounts = async () => {
      if (!orgId) return;
      setAccountsLoading(true);
      try {
        const { data, error } = await supabase
          .from("accounts")
          .select("id,name,type,currency")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) setAccounts((data as AccountRow[]) ?? []);
      } catch (e: any) {
        console.error("Failed to load accounts:", e);
        toast({
          title: "Could not load accounts",
          description: e?.message || "Please refresh and try again.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    };

    loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [orgId, toast]);

  useEffect(() => {
    // if parent passes a default accountId later, honor it
    if (accountId && accountId !== selectedAccountId) {
      setSelectedAccountId(accountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
    },
    maxFiles: 1,
  });

  const handleProcess = async () => {
    if (!selectedFile) return;

    if (!selectedAccountId) {
      toast({
        title: "Pick an account first",
        description: "Select which bank/credit account this CSV belongs to.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const csvText = await selectedFile.text();

      const { data, error } = await supabase.functions.invoke("process-csv-transactions", {
        body: {
          csvContent: csvText,
          orgId,
          accountId: selectedAccountId, // ✅ REQUIRED by the Edge Function now
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Imported ${data?.imported ?? 0} transactions`,
      });

      setSelectedFile(null);
      onUploadComplete();
    } catch (error: any) {
      console.error("CSV processing error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to process CSV file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
  };

  if (selectedFile) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClear}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* ✅ Account picker (real accounts table) */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Which account is this CSV from?</p>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger disabled={accountsLoading}>
                <SelectValue placeholder={accountsLoading ? "Loading..." : "Select an account"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(!accountsLoading && accounts.length === 0) && (
              <div className="text-xs text-muted-foreground">
                No accounts found for this org. Add accounts first.
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleProcess}
              disabled={isProcessing || !selectedAccountId || accountsLoading}
              className="flex-1"
            >
              {isProcessing ? "Processing..." : "Import Transactions"}
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={isProcessing}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      {...getRootProps()}
      className={`p-8 border-2 border-dashed cursor-pointer transition-colors ${
        isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4 text-center">
        <Upload className={`h-12 w-12 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
        <div>
          <p className="text-lg font-medium">
            {isDragActive ? "Drop CSV file here" : "Upload Bank Statement CSV"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Drag and drop or click to select a CSV file
          </p>
        </div>
      </div>
    </Card>
  );
};

export default CSVUploader;
