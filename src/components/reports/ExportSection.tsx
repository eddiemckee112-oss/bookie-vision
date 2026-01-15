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
    // Prevent CSV injection
    if (/^[=+\-@|]/.test(str)) return "'" + str;
    // Escape quotes
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

  // Cash detector (kept simple + safe)
  // If you want it perfect later, we can lock to your exact field name.
  const isCashReceipt = (r: any) => {
    const hay = `${r?.source ?? ""} ${r?.notes ?? ""} ${r?.vendor ?? ""} ${r?.payment_method ?? ""} ${r?.tender_type ?? ""}`.toLowerCase();
    if (r?.is_cash === true) return true;
    if (r?.paid_cash === true) return true;
    if (hay.includes("cash")) return true;
    return false;
  };

  const exportLedger = async () => {
    try {
      const from = fromDate ? format(fromDate, "yyyy-MM-dd") : null;
      const to = toDate ? format(toDate, "yyyy-MM-dd") : null;

      // 1) ALL transactions in range (paged)
      const transactions = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        let q = supabase
          .from("transactions")
          .select("*")
          .eq("org_id", orgId)
          .order("txn_date", { ascending: true })
          .range(rangeFrom, rangeTo);

        if (from) q = q.gte("txn_date", from);
        if (to) q = q.lte("txn_date", to);

        return await q;
      });

      // 2) ALL matches (paged) — map txn -> receipt
      const matches = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        const q = supabase
          .from("matches")
          .select("transaction_id,receipt_id")
          .eq("org_id", orgId)
          .range(rangeFrom, rangeTo);

        return await q;
      });

      const txnToReceipt = new Map<string, string>();
      const matchedReceiptIds: string[] = [];

      for (const m of matches || []) {
        if (!m?.transaction_id || !m?.receipt_id) continue;
        txnToReceipt.set(m.transaction_id, m.receipt_id);
        matchedReceiptIds.push(m.receipt_id);
      }

      // 3) Pull receipts needed for matched image_url (chunk .in() so it can’t explode)
      const uniqueReceiptIds = Array.from(new Set(matchedReceiptIds));
      const receiptsMap = new Map<string, any>();

      const chunkSize = 500;
      for (let i = 0; i < uniqueReceiptIds.length; i += chunkSize) {
        const chunk = uniqueReceiptIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("receipts")
          .select("id,image_url,receipt_date,vendor,source,total,category")
          .eq("org_id", orgId)
          .in("id", chunk);

        if (error) throw error;
        (data || []).forEach((r: any) => receiptsMap.set(r.id, r));
      }

      // 4) Cash receipts in range (paged) — always included as rows
      const allReceiptsInRange = await fetchAll<any>(async (rangeFrom, rangeTo) => {
        let q = supabase
          .from("receipts")
          .select("*")
          .eq("org_id", orgId)
          .order("receipt_date", { ascending: true })
          .range(rangeFrom, rangeTo);

        if (from) q = q.gte("receipt_date", from);
        if (to) q = q.lte("receipt_date", to);

        return await q;
      });

      const cashReceipts = (allReceiptsInRange || []).filter((r: any) => isCashReceipt(r));

      // 5) Build ledger rows (clean columns)
      type LedgerRow = {
        date: string;
        description: string;
        vendor: string;
        amount_signed: number;
        category: string;
        source: string;
        entry_type: "bank_cc" | "matched" | "cash";
        receipt_image_url: string;
      };

      const ledger: LedgerRow[] = [];

      // Bank/CC txns (receipt_image_url only if matched)
      for (const t of transactions || []) {
        const signedAmount =
          String(t.direction || "").toLowerCase() === "credit"
            ? Number(t.amount ?? 0)
            : -Number(t.amount ?? 0);

        const rid = txnToReceipt.get(t.id);
        const r = rid ? receiptsMap.get(rid) : null;

        ledger.push({
          date: String(t.txn_date ?? ""),
          description: String(t.description ?? ""),
          vendor: String(t.vendor_clean ?? ""),
          amount_signed: signedAmount,
          category: String(t.category ?? ""),
          source: String(t.source_account_name ?? t.institution ?? ""),
          entry_type: r ? "matched" : "bank_cc",
          receipt_image_url: String(r?.image_url ?? ""),
        });
      }

      // Cash receipts as income rows (positive)
      for (const r of cashReceipts) {
        ledger.push({
          date: String(r.receipt_date ?? ""),
          description: String(r.vendor ?? "Cash Receipt"),
          vendor: String(r.vendor ?? ""),
          amount_signed: Number(r.total ?? 0), // cash sales = money IN
          category: String(r.category ?? ""),
          source: "Cash",
          entry_type: "cash",
          receipt_image_url: String(r.image_url ?? ""),
        });
      }

      // 6) Sort by date (then entry_type, then description) so it’s organized
      ledger.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.entry_type < b.entry_type) return -1;
        if (a.entry_type > b.entry_type) return 1;
        if (a.description < b.description) return -1;
        if (a.description > b.description) return 1;
        return 0;
      });

      // 7) CSV
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

      const rows = ledger.map((x) =>
        [
          sanitizeCSV(x.date),
          sanitizeCSV(x.description),
          sanitizeCSV(x.vendor),
          x.amount_signed,
          sanitizeCSV(x.category),
          sanitizeCSV(x.source),
          sanitizeCSV(x.entry_type),
          sanitizeCSV(x.receipt_image_url),
        ].join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, `kosmos_ledger_${format(new Date(), "yyyy-MM-dd")}.csv`);

      toast({
        title: "Ledger exported",
        description: `Exported ${ledger.length} rows (no cap).`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error?.message ?? "Unknown error",
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
          Full export (no cap): bank/cc transactions + matched receipt image URLs + cash receipts
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
