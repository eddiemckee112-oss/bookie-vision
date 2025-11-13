import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ReceiptData } from "@/types/receipt";
import { useOrg } from "@/contexts/OrgContext";

interface ReceiptUploaderProps {
  onProcessingStart: () => void;
  onProcessingComplete: (data: ReceiptData & { imageUrl?: string }) => void;
}

const ReceiptUploader = ({
  onProcessingStart,
  onProcessingComplete,
}: ReceiptUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const { currentOrg } = useOrg();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      
      // Create preview for images
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

  const handleProcess = async () => {
    if (!selectedFile || !currentOrg) return;

    onProcessingStart();

    try {
      // Convert file to base64 for AI processing
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onloadend = async () => {
        const base64String = reader.result as string;

        // Process with AI
        const { data, error } = await supabase.functions.invoke("process-receipt", {
          body: { image: base64String },
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        // Upload image to storage
        const timestamp = Date.now();
        const fileExt = selectedFile.name.split('.').pop();
        const filePath = `${currentOrg.id}/${timestamp}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, selectedFile);

        if (uploadError) {
          if (import.meta.env.DEV) {
            console.error("Error uploading receipt image:", uploadError);
          }
          // Continue even if upload fails - we have the data
        }

        // Return data with image URL
        onProcessingComplete({
          ...data.receiptData,
          imageUrl: uploadError ? undefined : filePath,
        });
        
        toast({
          title: "Receipt processed!",
          description: "Data extracted successfully.",
        });

        // Clear the form
        setSelectedFile(null);
        setPreview(null);
      };

      reader.onerror = () => {
        throw new Error("Failed to read file");
      };
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Processing error:", error);
      }
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process receipt. Please try again.",
        variant: "destructive",
      });
      onProcessingComplete({
        vendor: "Error",
        date: new Date().toISOString(),
        total: 0,
        items: [],
      });
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
      >
        <input {...getInputProps()} />
        
        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
            <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
          </div>
        ) : selectedFile ? (
          <div className="space-y-2">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-sm font-medium">{selectedFile.name}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">
                {isDragActive ? "Drop your receipt here" : "Upload Receipt"}
              </p>
              <p className="text-sm text-muted-foreground">
                Drag & drop or click to select (Images or PDF)
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="flex gap-2">
          <Button onClick={handleProcess} className="flex-1">
            <ImageIcon className="mr-2 h-4 w-4" />
            Process Receipt
          </Button>
          <Button onClick={handleClear} variant="outline">
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReceiptUploader;