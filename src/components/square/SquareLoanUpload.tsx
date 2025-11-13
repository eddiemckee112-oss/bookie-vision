import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2 } from "lucide-react";

interface SquareLoanUploadProps {
  orgId: string;
  onComplete?: () => void;
}

const SquareLoanUpload = ({ orgId, onComplete }: SquareLoanUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a Square loan CSV file",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvContent = e.target?.result as string;

        const { data, error } = await supabase.functions.invoke("process-square-data", {
          body: {
            type: "loan",
            csv: csvContent,
            org_id: orgId,
          },
        });

        if (error) throw error;

        const errorMsg = data.errors?.length > 0 
          ? `Errors: ${data.errors.slice(0, 3).join('; ')}` 
          : '';

        toast({
          title: "Success",
          description: `Imported ${data.imported} loan records. Duplicates: ${data.duplicates || 0}, Skipped: ${data.skipped || 0}. ${errorMsg}`,
        });

        setFile(null);
        if (onComplete) onComplete();
      };

      reader.readAsText(file);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process Square loan CSV",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="loan-file">Square Loan CSV</Label>
        <Input
          id="loan-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={loading}
        />
      </div>
      <Button onClick={handleUpload} disabled={loading || !file} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Import Loan Data
          </>
        )}
      </Button>
    </div>
  );
};

export default SquareLoanUpload;
