import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CSVUploaderProps {
  orgId: string;
  accountId?: string;
  onUploadComplete: () => void;
}

const CSVUploader = ({ orgId, accountId, onUploadComplete }: CSVUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const handleProcess = async () => {
    if (!selectedFile) return;

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
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Imported ${data.imported} transactions`,
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
          <div className="flex gap-3">
            <Button onClick={handleProcess} disabled={isProcessing} className="flex-1">
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