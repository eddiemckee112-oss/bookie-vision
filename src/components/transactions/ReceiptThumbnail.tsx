import { supabase } from "@/integrations/supabase/client";
import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptThumbnailProps {
  vendor: string;
  imageUrl: string | null;
  total: number;
}

const ReceiptThumbnail = ({ vendor, imageUrl, total }: ReceiptThumbnailProps) => {
  const handleOpenImage = () => {
    if (!imageUrl) return;
    const { data } = supabase.storage.from('receipts').getPublicUrl(imageUrl);
    window.open(data.publicUrl, "_blank");
  };

  return (
    <div className="flex items-center gap-2">
      {imageUrl ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenImage}
          className="flex items-center gap-2 h-auto py-1"
        >
          <FileText className="h-4 w-4 text-primary" />
          <div className="text-left">
            <div className="text-sm font-medium">{vendor}</div>
            <div className="text-xs text-muted-foreground">${total.toFixed(2)}</div>
          </div>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </Button>
      ) : (
        <div className="flex items-center gap-2 px-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="text-left">
            <div className="text-sm font-medium">{vendor}</div>
            <div className="text-xs text-muted-foreground">${total.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptThumbnail;
