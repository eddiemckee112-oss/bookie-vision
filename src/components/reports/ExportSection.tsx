import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ExportSectionProps {
  orgId: string;
  fromDate: Date | undefined;
  toDate: Date | undefined;
}

const ExportSection = ({ orgId, fromDate, toDate }: ExportSectionProps) => {
  const { toast } = useToast();

  const sanitizeCSV = (value: any) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/^[=+\-@|]/.test(str)) return "'" + str;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLedger = async () => {
    try {
      /* ---------------- TRANSACTIONS ---------------- */
      let txnQuery = supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId);

      if (fromDate) {
        txnQuery = txnQuery.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        txnQuery = txnQuery.lte("txn_date", format(toDate, "yyyy-MM-dd"));
      }

      const { data: transactions, error: txnError } = await txnQuery;
      if (txnError) throw txnError;

      /* ---------------- MATCHES ---------------- */
      const { data: matches } = await supabase
        .from("matches")
        .select("transaction_id, receipt_id")
        .eq("org_id", orgId);

      const txnToReceipt = new Map<string, string>();
      matches?.forEach(m => txnToReceipt.set(m.transaction_id, m.receipt_id));

      /* ---------------- RECEIPTS ---------------- */
      let receiptQuery = supabase
        .from("receipts")
        .select("*")
        .eq("org_id", orgId);

      if (fromDate) {
        receiptQuery = receiptQuery.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        receiptQuery = receiptQuery.lte("receipt_date", format(toDate, "yyyy-MM-dd"));
      }

      const { data: receipts, error: receiptError } = await receiptQuery;
      if (receiptError) throw receiptError;

      const receiptMap = new Map(receipts?.map(r => [r.id, r]));

      /* ---------------- BUILD LEDGER ---------------- */
      const ledgerRows: any[] = [];

      // Transactions
      for (const t of transactions || []) {
        const signedAmount =
          t.direction === "credit" ? t.amount : -t.amount;

        const receipt = txnToReceipt.has(t.id)
          ? receiptMap.get(txnToReceipt.get(t.id)!)
          : null;

        ledgerRows.push({
          date: t.txn_date,
          description: t.description,
          vendor: t.vendor_clean || "",
          amount_signed: signedAmount,
          category: t.category || "",
          source: t.source_account_name || "",
          entry_type: receipt ? "matched" : "bank_cc",
          receipt_image_url: receipt?.image_url || "",
        });
      }

      // Cash receipts (always included)
      for (const r of receipts || []) {
        if (r.source !== "cash") continue;

        ledgerRows.push({
          date: r.receipt_date,
          description: r.vendor || "Cash Receipt",
          vendor: r.vendor || "",
          amount_signed: -Math.abs(r.total || 0),
          category: r.category || "",
          source: "Cash",
          entry_type: "cash",
          receipt_image_url: r.image_url || "",
        });
      }

      /* ---------------- CSV ---------------- */
      const headers = [
        "date",
        "description",
        "vendor",
        "amount_signed",
        "category",
        "source",
        "entry_type",
        "receipt_image_url",
      ];

      const rows = ledgerRows.map(row =>
        [
          sanitizeCSV(row.date),
          sanitizeCSV(row.description),
          sanitizeCSV(row.vendor),
          row.amount_signed,
          sanitizeCSV(row.category),
          sanitizeCSV(row.source),
          sanitizeCSV(row.entry_type),
          sanitizeCSV(row.receipt_image_url),
        ].join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");

      downloadCSV(
        csv,
        `kosmos_ledger_${format(new Date(), "yyyy-MM-dd")}.csv`
      );

      toast({
        title: "Ledger exported",
        description: `${ledgerRows.length} rows exported successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Accounting Ledger Export
        </CardTitle>
        <CardDescription>
          Full CRA-ready ledger including matched receipts and cash sales
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={exportLedger} className="w-full">
          <Download className="mr-2 h-4 w-4" />
          Export Ledger CSV
        </Button>
      </CardContent>
    </Card>
  );
};

export default ExportSection;
