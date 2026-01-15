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
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/^[=+\-@|]/.test(str)) return "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  };

  const formatDateForFilename = () => format(new Date(), "yyyy-MM-dd");

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ✅ Real fix: pull ALL rows with paging (no 1000 cap)
  const fetchAll = async <T,>(
    queryFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
    pageSize = 1000
  ): Promise<T[]> => {
    const out: T[] = [];
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await queryFactory(from, to);
      if (error) throw error;

      const rows = (data ?? []) as T[];
      out.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return out;
  };

  // ✅ Cash detector (safe defaults). Once you show me receipts columns, we’ll tighten it.
  const isCashReceipt = (r: any) => {
    const hay = `${r?.source ?? ""} ${r?.notes ?? ""} ${r?.vendor ?? ""} ${r?.payment_method ?? ""} ${r?.tender_type ?? ""}`.toLowerCase();
    if (r?.is_cash === true) return true;
    if (r?.paid_cash === true) return true;
    if (hay.includes("cash")) return true;
    return false;
  };

  const exportReceipts = async () => {
    try {
      const from = fromDate ? format(fromDate, "yyyy-MM-dd") : null;
      const to = toDate ? format(toDate, "yyyy-MM-dd") : null;

      const allReceipts = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        let query = supabase
          .from("receipts")
          .select("*")
          .eq("org_id", orgId)
          .order("receipt_date", { ascending: false })
          .range(rangeFrom, rangeTo);

        if (from) query = query.gte("receipt_date", from);
        if (to) query = query.lte("receipt_date", to);

        return await query;
      });

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
        "reconciled",
      ];

      const rows = (allReceipts || []).map((r: any) =>
        [
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
          r.reconciled,
        ].join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_receipts_${formatDateForFilename()}.csv`);

      toast({ title: `Receipts exported (${rows.length})` });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // ✅ MAIN FIX: Export a full ledger:
  // - all transactions
  // - plus matched receipt details on each transaction row
  // - plus cash receipts as extra rows
  const exportTransactions = async () => {
    try {
      const from = fromDate ? format(fromDate, "yyyy-MM-dd") : null;
      const to = toDate ? format(toDate, "yyyy-MM-dd") : null;

      // 1) Pull ALL transactions in range
      const txns = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        let query = supabase
          .from("transactions")
          .select("*")
          .eq("org_id", orgId)
          .order("txn_date", { ascending: true })
          .range(rangeFrom, rangeTo);

        if (from) query = query.gte("txn_date", from);
        if (to) query = query.lte("txn_date", to);

        return await query;
      });

      // 2) Pull matches (for this org) and map txn->receipt
      const matches = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        const query = supabase
          .from("matches")
          .select("transaction_id,receipt_id")
          .eq("org_id", orgId)
          .range(rangeFrom, rangeTo);
        return await query;
      });

      const txnToReceipt = new Map<string, string>();
      const receiptIds: string[] = [];
      for (const m of matches || []) {
        if (m?.transaction_id && m?.receipt_id) {
          txnToReceipt.set(m.transaction_id, m.receipt_id);
          receiptIds.push(m.receipt_id);
        }
      }

      // 3) Pull receipts for those matched ids (batched)
      const uniqueReceiptIds = Array.from(new Set(receiptIds));
      let receipts: any[] = [];

      if (uniqueReceiptIds.length > 0) {
        // .in() also has practical limits, chunk it
        const chunkSize = 500;
        for (let i = 0; i < uniqueReceiptIds.length; i += chunkSize) {
          const chunk = uniqueReceiptIds.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from("receipts")
            .select("*")
            .eq("org_id", orgId)
            .in("id", chunk);
          if (error) throw error;
          receipts.push(...(data || []));
        }
      }

      const receiptsMap = new Map(receipts.map((r: any) => [r.id, r]));

      // 4) Pull ALL receipts in range so we can append CASH ones (even if no match row)
      const allReceiptsInRange = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        let query = supabase
          .from("receipts")
          .select("*")
          .eq("org_id", orgId)
          .order("receipt_date", { ascending: true })
          .range(rangeFrom, rangeTo);

        if (from) query = query.gte("receipt_date", from);
        if (to) query = query.lte("receipt_date", to);

        return await query;
      });

      const cashReceipts = (allReceiptsInRange || []).filter((r: any) => isCashReceipt(r));

      // 5) Build rows:
      // - transaction rows get receipt columns if matched
      // - cash receipts become extra rows (entry_type=cash_receipt)
      const headers = [
        "entry_type",                 // bank_cc | cash_receipt
        "date",
        "description",
        "vendor",
        "amount_signed",              // credits +, debits -
        "direction",
        "category",
        "source",
        "transaction_id",
        "receipt_id",
        // receipt details if matched (or cash)
        "receipt_date",
        "receipt_vendor",
        "receipt_total",
        "receipt_tax",
        "receipt_subtotal",
        "receipt_category",
        "receipt_source",
        "receipt_image_url",
      ];

      const txnRows = (txns || []).map((t: any) => {
        const signedAmount = t.direction === "credit" ? Number(t.amount ?? 0) : -Number(t.amount ?? 0);

        const rid = txnToReceipt.get(t.id);
        const r = rid ? receiptsMap.get(rid) : null;

        return [
          sanitizeCSV("bank_cc"),
          sanitizeCSV(t.txn_date),
          sanitizeCSV(t.description),
          sanitizeCSV(t.vendor_clean),
          signedAmount,
          sanitizeCSV(t.direction),
          sanitizeCSV(t.category),
          sanitizeCSV(t.source_account_name || t.institution),
          sanitizeCSV(t.id),
          sanitizeCSV(rid || ""),
          // receipt columns
          sanitizeCSV(r?.receipt_date || ""),
          sanitizeCSV(r?.vendor || ""),
          r?.total ?? "",
          r?.tax ?? "",
          r?.subtotal ?? "",
          sanitizeCSV(r?.category || ""),
          sanitizeCSV(r?.source || ""),
          sanitizeCSV(r?.image_url || ""),
        ].join(",");
      });

      // Cash receipts as “transactions”
      const cashRows = cashReceipts.map((r: any) => {
        const total = Number(r.total ?? 0);

        return [
          sanitizeCSV("cash_receipt"),
          sanitizeCSV(r.receipt_date),
          sanitizeCSV(r.vendor || "Cash Receipt"),
          sanitizeCSV(r.vendor || ""),
          total, // cash sales = money IN
          sanitizeCSV("credit"),
          sanitizeCSV(r.category || "Sales Income"),
          sanitizeCSV(r.source || "Cash"),
          sanitizeCSV(""),
          sanitizeCSV(r.id),
          sanitizeCSV(r.receipt_date || ""),
          sanitizeCSV(r.vendor || ""),
          r.total ?? "",
          r.tax ?? "",
          r.subtotal ?? "",
          sanitizeCSV(r.category || ""),
          sanitizeCSV(r.source || ""),
          sanitizeCSV(r.image_url || ""),
        ].join(",");
      });

      const csv = [headers.join(","), ...txnRows, ...cashRows].join("\n");
      downloadCSV(csv, `kosmos_ledger_${formatDateForFilename()}.csv`);

      toast({
        title: "Ledger exported",
        description: `Exported ${txnRows.length} transactions + ${cashRows.length} cash receipts.`,
      });
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
      const matchesData = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        const q = supabase
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
          .eq("org_id", orgId)
          .range(rangeFrom, rangeTo);

        return await q;
      });

      const transactionIds = matchesData?.map((m: any) => m.transaction_id) || [];
      const receiptIds = matchesData?.map((m: any) => m.receipt_id) || [];

      const from = fromDate ? format(fromDate, "yyyy-MM-dd") : null;
      const to = toDate ? format(toDate, "yyyy-MM-dd") : null;

      let transactionsData: any[] = [];
      let receiptsData: any[] = [];

      if (transactionIds.length > 0) {
        const uniqueTxnIds = Array.from(new Set(transactionIds));
        const chunkSize = 500;
        for (let i = 0; i < uniqueTxnIds.length; i += chunkSize) {
          const chunk = uniqueTxnIds.slice(i, i + chunkSize);

          let q = supabase.from("transactions").select("*").in("id", chunk).eq("org_id", orgId);
          if (from) q = q.gte("txn_date", from);
          if (to) q = q.lte("txn_date", to);

          const { data, error } = await q;
          if (error) throw error;
          transactionsData.push(...(data || []));
        }
      }

      if (receiptIds.length > 0) {
        const uniqueReceiptIds = Array.from(new Set(receiptIds));
        const chunkSize = 500;
        for (let i = 0; i < uniqueReceiptIds.length; i += chunkSize) {
          const chunk = uniqueReceiptIds.slice(i, i + chunkSize);

          const { data, error } = await supabase
            .from("receipts")
            .select("*")
            .in("id", chunk)
            .eq("org_id", orgId);

          if (error) throw error;
          receiptsData.push(...(data || []));
        }
      }

      const transactionsMap = new Map(transactionsData.map((t) => [t.id, t]));
      const receiptsMap = new Map(receiptsData.map((r) => [r.id, r]));

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
        "receipt_image_url",
      ];

      const rows = (matchesData || [])
        .filter((m: any) => transactionsMap.has(m.transaction_id))
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
            sanitizeCSV(receipt?.image_url),
          ].join(",");
        });

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_matched_pairs_${formatDateForFilename()}.csv`);

      toast({ title: `Matched pairs exported (${rows.length})` });
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
            Export (FULL) Ledger
          </CardTitle>
          <CardDescription>
            Full export: bank/cc transactions + matched receipt details + cash receipts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportTransactions} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Export Ledger CSV
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
