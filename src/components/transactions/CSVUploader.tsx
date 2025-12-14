import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CSVUploaderProps {
  orgId: string;
  accountId?: string;
  onUploadComplete: () => void;
}

const SOURCE_PRESETS = [
  { label: "CIBC Bank (Chequing)", institution: "CIBC", source_account_name: "CIBC Bank Account" },
  { label: "CIBC Visa / Credit Card", institution: "CIBC", source_account_name: "CIBC Credit Card" },
  { label: "Rogers MasterCard", institution: "Rogers", source_account_name: "Rogers MasterCard" },
  { label: "PC MasterCard", institution: "PC", source_account_name: "PC MasterCard" },
  { label: "Other / Custom", institution: "Other", source_account_name: "" },
] as const;

type SourcePresetLabel = (typeof SOURCE_PRESETS)[number]["label"];

const CSVUploader = ({ orgId, accountId, onUploadComplete }: CSVUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [sourcePreset, setSourcePreset] = useState<SourcePresetLabel>(SOURCE_PRESETS[0].label);
  const [customSourceName, setCustomSourceName] = useState<string>("");

  const { toast } = useToast();

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

  const resolvedSource = () => {
    const preset = SOURCE_PRESETS.find((p) => p.label === sourcePreset) || SOURCE_PRESETS[0];

    if (preset.label === "Other / Custom") {
      return {
        institution: "Other",
        source_account_name: customSourceName.trim() || "Bank CSV",
      };
    }

    return {
      institution: preset.institution,
      source_account_name: preset.source_account_name,
    };
  };

  const handleProcess = async () => {
    if (!selectedFile) return;

    // Make sure they picked something sensible
    const { institution, source_account_name } = resolvedSource();
    if (!source_account_name) {
      toast({
        title: "Missing source name",
        description: "Please choose a source (or enter a custom one).",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const csvText = await selectedFile.text();

      // Fetch account name if accountId is provided
      let accountName = undefined;
      if (accountId) {
        const { data: accountData } = await supabase
          .from("accounts")
          .select("name")
          .eq("id", accountId)
          .single();
        accountName = accountData?.name;
      }

      const { data, error } = await supabase.functions.invoke("process-csv-transactions", {
        body: {
          csvContent: csvText,
          orgId,
          accountId,
          accountName,

          // ✅ NEW: explicit labels so it never becomes “CSV Import”
          institution,
          sourceAccountName: source_account_name,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Imported ${data.imported} transactions (rules applied: ${data.categorized || 0})`,
      });

      setSelectedFile(null);
      onUploadComplete();
    } catch (error: any) {
      console.error("CSV processing error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to process CSV file",
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
    const preset = SOURCE_PRESETS.find((p) => p.label === sourcePreset) || SOURCE_PRESETS[0];

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

          {/* ✅ NEW: Ask what bank/account this CSV belongs to */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Import source</p>
            <Select value={sourcePreset} onValueChange={(v) => setSourcePreset(v as SourcePresetLabel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_PRESETS.map((p) => (
                  <SelectItem key={p.label} value={p.label}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preset.label === "Other / Custom" && (
              <input
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter source name (e.g., TD Chequing)"
                value={customSourceName}
                onChange={(e) => setCustomSourceName(e.target.value)}
              />
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleProcess} disabled={isProcessing} className="flex-1">
              {isProcessing ? "Processing..." : "Import Transactions"}
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={isProcessing}>
              Cancel
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Tip: This label will be saved into <b>source_account_name</b> and <b>institution</b> so reports export cleanly.
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
