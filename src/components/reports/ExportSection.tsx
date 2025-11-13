import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText, ArrowLeftRight, Receipt } from "lucide-react";
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
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Prevent CSV injection
    if (/^[=+\-@|]/.test(str)) {
      return "'" + str;
    }
    // Escape quotes
    return '"' + str.replace(/"/g, '""') + '"';
  };

  const formatDateForFilename = () => {
    return format(new Date(), "yyyy-MM-dd");
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

  const exportReceipts = async () => {
    try {
      let query = supabase
        .from("receipts")
        .select("*")
        .eq("org_id", orgId)
        .order("receipt_date", { ascending: false });

      if (fromDate) {
        query = query.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        query = query.lte("receipt_date", format(toDate, "yyyy-MM-dd"));
      }

      const { data, error } = await query;

      if (error) throw error;

      const headers = [
        "receipt_id",
        "receipt_date",
        "vendor",
        "total",
        "tax",
        "subtotal",
        "category",
        "source",
        "notes",
        "image_url",
        "reconciled"
      ];

      const rows = (data || []).map((r: any) => [
        sanitizeCSV(r.id),
        sanitizeCSV(r.receipt_date),
        sanitizeCSV(r.vendor),
        r.total,
        r.tax,
        r.subtotal,
        sanitizeCSV(r.category),
        sanitizeCSV(r.source),
        sanitizeCSV(r.notes),
        sanitizeCSV(r.image_url),
        r.reconciled
      ].join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_receipts_${formatDateForFilename()}.csv`);

      toast({ title: "Receipts exported successfully" });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const exportTransactions = async () => {
    try {
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId)
        .order("txn_date", { ascending: false });

      if (fromDate) {
        query = query.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        query = query.lte("txn_date", format(toDate, "yyyy-MM-dd"));
      }

      const { data, error } = await query;

      if (error) throw error;

      const headers = [
        "transaction_id",
        "txn_date",
        "post_date",
        "description",
        "vendor_clean",
        "amount",
        "direction",
        "category",
        "source_account_name",
        "institution",
        "imported_via",
        "csv_row",
        "external_id"
      ];

      // Credits positive, debits negative for Excel pivot tables
      const rows = (data || []).map((t: any) => {
        const signedAmount = t.direction === "credit" ? t.amount : -t.amount;
        return [
          sanitizeCSV(t.id),
          sanitizeCSV(t.txn_date),
          sanitizeCSV(t.post_date),
          sanitizeCSV(t.description),
          sanitizeCSV(t.vendor_clean),
          signedAmount,
          sanitizeCSV(t.direction),
          sanitizeCSV(t.category),
          sanitizeCSV(t.source_account_name),
          sanitizeCSV(t.institution),
          sanitizeCSV(t.imported_via),
          t.csv_row || "",
          sanitizeCSV(t.external_id)
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_transactions_${formatDateForFilename()}.csv`);

      toast({ title: "Transactions exported successfully" });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const exportMatchedPairs = async () => {
    try {
      let matchesQuery = supabase
        .from("matches")
        .select(`
          id,
          created_at,
          method,
          match_type,
          confidence,
          matched_amount,
          transaction_id,
          receipt_id
        `)
        .eq("org_id", orgId);

      const { data: matchesData, error: matchesError } = await matchesQuery;

      if (matchesError) throw matchesError;

      // Fetch all transaction and receipt IDs
      const transactionIds = matchesData?.map(m => m.transaction_id) || [];
      const receiptIds = matchesData?.map(m => m.receipt_id) || [];

      let transactionsData: any[] = [];
      let receiptsData: any[] = [];

      if (transactionIds.length > 0) {
        let txnQuery = supabase
          .from("transactions")
          .select("*")
          .in("id", transactionIds);

        if (fromDate) {
          txnQuery = txnQuery.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
        }
        if (toDate) {
          txnQuery = txnQuery.lte("txn_date", format(toDate, "yyyy-MM-dd"));
        }

        const { data, error } = await txnQuery;
        if (error) throw error;
        transactionsData = data || [];
      }

      if (receiptIds.length > 0) {
        const { data, error } = await supabase
          .from("receipts")
          .select("*")
          .in("id", receiptIds);

        if (error) throw error;
        receiptsData = data || [];
      }

      // Create maps for quick lookup
      const transactionsMap = new Map(transactionsData.map(t => [t.id, t]));
      const receiptsMap = new Map(receiptsData.map(r => [r.id, r]));

      const headers = [
        "match_id",
        "match_created_at",
        "match_method",
        "match_type",
        "match_confidence",
        "transaction_id",
        "txn_date",
        "txn_description",
        "txn_amount",
        "txn_category",
        "txn_source_account_name",
        "receipt_id",
        "receipt_date",
        "receipt_vendor",
        "receipt_total",
        "receipt_tax",
        "receipt_category",
        "receipt_image_url"
      ];

      const rows = (matchesData || [])
        .filter(m => transactionsMap.has(m.transaction_id)) // Only include if transaction matches date filter
        .map((m: any) => {
          const txn = transactionsMap.get(m.transaction_id);
          const receipt = receiptsMap.get(m.receipt_id);

          return [
            sanitizeCSV(m.id),
            sanitizeCSV(m.created_at),
            sanitizeCSV(m.method),
            sanitizeCSV(m.match_type),
            m.confidence,
            sanitizeCSV(m.transaction_id),
            sanitizeCSV(txn?.txn_date),
            sanitizeCSV(txn?.description),
            txn?.amount,
            sanitizeCSV(txn?.category),
            sanitizeCSV(txn?.source_account_name),
            sanitizeCSV(m.receipt_id),
            sanitizeCSV(receipt?.receipt_date),
            sanitizeCSV(receipt?.vendor),
            receipt?.total,
            receipt?.tax,
            sanitizeCSV(receipt?.category),
            sanitizeCSV(receipt?.image_url)
          ].join(",");
        });

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_matched_pairs_${formatDateForFilename()}.csv`);

      toast({ title: "Matched pairs exported successfully" });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Receipts
          </CardTitle>
          <CardDescription>
            Export all receipts with vendor, amounts, tax, and image URLs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportReceipts} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Export Receipts CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Transactions
          </CardTitle>
          <CardDescription>
            Export all transactions with signed amounts (credits +, debits -)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportTransactions} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Export Transactions CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Matched Pairs
          </CardTitle>
          <CardDescription>
            Export receipt-transaction matches for audit trail
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportMatchedPairs} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Export Matched Pairs CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportSection;
