import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2 } from "lucide-react";

interface SquarePaymentsUploadProps {
  orgId: string;
  onComplete?: () => void;
}

const SquarePaymentsUpload = ({ orgId, onComplete }: SquarePaymentsUploadProps) => {
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
        description: "Please select a Square payments CSV file",
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
            type: "payments",
            csv: csvContent,
            org_id: orgId,
          },
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: `Imported ${data.imported} payment transactions. ${data.duplicates || 0} duplicates skipped.`,
        });

        setFile(null);
        if (onComplete) onComplete();
      };

      reader.readAsText(file);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process Square payments CSV",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="payments-file">Square Payments CSV</Label>
        <Input
          id="payments-file"
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
            Import Payments
          </>
        )}
      </Button>
    </div>
  );
};

export default SquarePaymentsUpload;
