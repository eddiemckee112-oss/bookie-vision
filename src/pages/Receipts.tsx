import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import ReceiptUploader from "@/components/receipt/ReceiptUploader";
import { ReceiptData } from "@/types/receipt";
import ProcessingState from "@/components/receipt/ProcessingState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Receipt {
  id: string;
  vendor: string;
  receipt_date: string;
  total: number;
  category: string | null;
  source: string | null;
  reconciled: boolean;
}

const Receipts = () => {
  const { currentOrg, loading: orgLoading, orgRole } = useOrg();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchReceipts();
  }, [currentOrg, orgLoading, navigate]);

  const fetchReceipts = async () => {
    if (!currentOrg) return;
    
    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("receipt_date", { ascending: false });

    if (error) {
      toast({
        title: "Error fetching receipts",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setReceipts(data || []);
  };

  const handleProcessingComplete = async (data: ReceiptData) => {
    setIsProcessing(false);

    if (!currentOrg) return;

    // Save to database
    const { error } = await supabase.from("receipts").insert({
      org_id: currentOrg.id,
      vendor: data.vendor,
      receipt_date: data.date.split("T")[0],
      total: data.total,
      tax: data.tax || 0,
      category: data.category,
      source: data.paymentMethod,
    });

    if (error) {
      toast({
        title: "Error saving receipt",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    fetchReceipts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("receipts").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error deleting receipt",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Receipt deleted" });
    fetchReceipts();
  };

  const canDelete = orgRole === "owner" || orgRole === "admin";

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Receipts</h1>
          <p className="text-muted-foreground">Upload and manage your receipts</p>
        </div>

        <Card className="p-6">
          {isProcessing ? (
            <ProcessingState />
          ) : (
            <ReceiptUploader
              onProcessingStart={() => setIsProcessing(true)}
              onProcessingComplete={handleProcessingComplete}
            />
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Receipts</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canDelete && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 7 : 6} className="text-center text-muted-foreground">
                    No receipts yet. Upload one above to get started!
                  </TableCell>
                </TableRow>
              ) : (
                receipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{new Date(receipt.receipt_date).toLocaleDateString()}</TableCell>
                    <TableCell>{receipt.vendor}</TableCell>
                    <TableCell>{receipt.category || "-"}</TableCell>
                    <TableCell>{receipt.source || "-"}</TableCell>
                    <TableCell className="text-right">${receipt.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={receipt.reconciled ? "default" : "secondary"}>
                        {receipt.reconciled ? "Matched" : "Unmatched"}
                      </Badge>
                    </TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(receipt.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Layout>
  );
};

export default Receipts;
