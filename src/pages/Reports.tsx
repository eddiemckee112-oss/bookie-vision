import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Reports = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchSummary();
  }, [currentOrg, orgLoading, navigate]);

  const fetchSummary = async () => {
    if (!currentOrg) return;

    const [receiptsRes, transactionsRes] = await Promise.all([
      supabase.from("receipts").select("total").eq("org_id", currentOrg.id),
      supabase.from("transactions").select("amount, direction").eq("org_id", currentOrg.id),
    ]);

    const totalReceipts = receiptsRes.data?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;
    const debits = transactionsRes.data?.filter(t => t.direction === "debit").reduce((sum, t) => sum + t.amount, 0) || 0;
    const credits = transactionsRes.data?.filter(t => t.direction === "credit").reduce((sum, t) => sum + t.amount, 0) || 0;

    setSummary({ totalReceipts, debits, credits });
  };

  const exportData = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("org_id", currentOrg.id);

    if (error) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const csv = [
      ["Date", "Vendor", "Category", "Source", "Total", "Tax", "Subtotal"].join(","),
      ...(data || []).map((r: any) =>
        [r.receipt_date, r.vendor, r.category || "", r.source || "", r.total, r.tax, r.subtotal].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export complete!" });
  };

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">Financial summaries and exports</p>
          </div>
          <Button onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${summary?.totalReceipts.toFixed(2) || "0.00"}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                -${summary?.debits.toFixed(2) || "0.00"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                +${summary?.credits.toFixed(2) || "0.00"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
