import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ReceiptData } from "@/types/receipt";

interface ReceiptUploaderProps {
  onProcessingStart: () => void;
  onProcessingComplete: (data: ReceiptData) => void;
}

const ReceiptUploader = ({
  onProcessingStart,
  onProcessingComplete,
}: ReceiptUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();

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
    if (!selectedFile) return;

    onProcessingStart();

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onloadend = async () => {
        const base64String = reader.result as string;

        const { data, error } = await supabase.functions.invoke("process-receipt", {
          body: { image: base64String },
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        onProcessingComplete(data.receiptData);
        
        toast({
          title: "Receipt processed!",
          description: "Data extracted successfully.",
        });
      };

      reader.onerror = () => {
        throw new Error("Failed to read file");
      };
    } catch (error: any) {
      console.error("Processing error:", error);
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

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragActive
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          }
        `}
      >
        <input {...getInputProps()} />
        
        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Receipt preview"
              className="max-h-48 mx-auto rounded-lg shadow-md"
            />
            <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
          </div>
        ) : selectedFile ? (
          <div className="space-y-2">
            <FileText className="h-12 w-12 mx-auto text-primary" />
            <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Drop your receipt here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports JPG, PNG, WEBP, and PDF files
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="flex gap-2">
          <Button
            onClick={handleProcess}
            className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:opacity-90 shadow-primary"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Process Receipt
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedFile(null);
              setPreview(null);
            }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReceiptUploader;
