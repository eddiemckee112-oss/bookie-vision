import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import CSVUploader from "@/components/transactions/CSVUploader";
import TransactionFilters from "@/components/transactions/TransactionFilters";
import TransactionSummary from "@/components/transactions/TransactionSummary";
import TransactionRow from "@/components/transactions/TransactionRow";
import BankSyncSection from "@/components/transactions/BankSyncSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  vendor_clean: string | null;
  amount: number;
  direction: string;
  category: string | null;
  source_account_name: string | null;
}

interface Match {
  transaction_id: string;
  receipt_id: string;
}

interface LinkedReceipt {
  id: string;
  vendor: string;
  image_url: string | null;
  total: number;
}

type DateMode = "this_month" | "last_month" | "month" | "range" | "all";

const pad2 = (n: number) => String(n).padStart(2, "0");
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const Transactions = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedReceipts, setLinkedReceipts] = useState<Record<string, LinkedReceipt>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);

  // date window controls
  const [dateMode, setDateMode] = useState<DateMode>("this_month");
  const [monthValue, setMonthValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`; // YYYY-MM
  });
  const [startDate, setStartDate] = useState(() => toYMD(firstDayOfMonth(new Date())));
  const [endDate, setEndDate] = useState(() => toYMD(lastDayOfMonth(new Date())));

  const { toast } = useToast();

  const dateWindow = useMemo(() => {
    const now = new Date();

    if (dateMode === "all") return { from: null as string | null, to: null as string | null };

    if (dateMode === "this_month") {
      return { from: toYMD(firstDayOfMonth(now)), to: toYMD(lastDayOfMonth(now)) };
    }

    if (dateMode === "last_month") {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: toYMD(firstDayOfMonth(lm)), to: toYMD(lastDayOfMonth(lm)) };
    }

    if (dateMode === "month") {
      const [y, m] = monthValue.split("-").map(Number);
      const d = new Date(y, (m || 1) - 1, 1);
      return { from: toYMD(firstDayOfMonth(d)), to: toYMD(lastDayOfMonth(d)) };
    }

    // range
    return { from: startDate || null, to: endDate || null };
  }, [dateMode, monthValue, startDate, endDate]);

  useEffect(() => {
    if (orgLoading) return;

    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    const linkReceiptId = sessionStorage.getItem("linkReceipt");
    if (linkReceiptId) setSelectedReceiptId(linkReceiptId);

    fetchTransactions();
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, orgLoading, navigate, dateMode, monthValue, startDate, endDate]);

  const fetchTransactions = async () => {
    if (!currentOrg) return;

    let q = supabase.from("transactions").select("*").eq("org_id", currentOrg.id);

    if (dateWindow.from) q = q.gte("txn_date", dateWindow.from);
    if (dateWindow.to) q = q.lte("txn_date", dateWindow.to);

    const { data, error } = await q.order("txn_date", { ascending: false }).limit(500);

    if (error) {
      toast({
        title: "Error fetching transactions",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setTransactions((data as any) || []);
  };

  const fetchMatches = async () => {
    if (!currentOrg) return;

    const { data: matchesData, error: matchesError } = await supabase
      .from("matches")
      .select("transaction_id, receipt_id")
      .eq("org_id", currentOrg.id);

    if (matchesError) {
      console.error("Error fetching matches:", matchesError);
      return;
    }

    const m = (matchesData as any[]) || [];
    setMatches(m);

    const receiptIds = m.map((x) => x.receipt_id).filter(Boolean);
    if (receiptIds.length > 0) {
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("receipts")
        .select("id, vendor, image_url, total")
        .in("id", receiptIds);

      if (!receiptsError && receiptsData) {
        const map: Record<string, LinkedReceipt> = {};
        (receiptsData as any[]).forEach((r) => (map[r.id] = r));
        setLinkedReceipts(map);
      }
    } else {
      setLinkedReceipts({});
    }
  };

  const handleLinkReceipt = async (transactionId: string) => {
    if (!selectedReceiptId || !currentOrg) return;

    try {
      const transaction = transactions.find((t) => t.id === transactionId);
      if (!transaction) return;

      const { error } = await supabase.from("matches").insert({
        org_id: currentOrg.id,
        transaction_id: transactionId,
        receipt_id: selectedReceiptId,
        matched_amount: transaction.amount,
        confidence: 1.0,
        method: "manual",
        match_type: "manual",
      });

      if (error) throw error;

      toast({ title: "Receipt linked successfully" });
      sessionStorage.removeItem("linkReceipt");
      setSelectedReceiptId(null);

      await fetchMatches();
    } catch (error: any) {
      toast({
        title: "Failed to link receipt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUnlinkReceipt = async (transactionId: string) => {
    if (!currentOrg) return;

    try {
      const { error } = await supabase
        .from("matches")
        .delete()
        .eq("transaction_id", transactionId)
        .eq("org_id", currentOrg.id);

      if (error) throw error;

      toast({ title: "Receipt unlinked" });
      await fetchMatches();
    } catch (error: any) {
      toast({
        title: "Failed to unlink receipt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUploadReceipt = () => {
    navigate("/receipts");
  };

  // ✅ Apply Rules (Edge Function)
  const handleApplyRules = async () => {
    if (!currentOrg) return;
    setIsApplyingRules(true);

    try {
      const { data, error } = await supabase.functions.invoke("smart-handler", {
        body: { orgId: currentOrg.id, action: "apply_rules" },
      });

      if (error) throw error;

      toast({
        title: "Rules applied",
        description: (data as any)?.message ?? "Done.",
      });

      await fetchTransactions();
    } catch (e: any) {
      toast({
        title: "Apply Rules failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setIsApplyingRules(false);
    }
  };

  // ✅ Auto Match (Edge Function)
  const handleAutoMatch = async () => {
    if (!currentOrg) return;
    setIsAutoMatching(true);

    try {
      const { data, error } = await supabase.functions.invoke("apply-reconciliation", {
        body: { orgId: currentOrg.id },
      });

      if (error) throw error;

      toast({
        title: "Auto Match complete",
        description: (data as any)?.message ?? "Done.",
      });

      await fetchMatches();
      await fetchTransactions();
    } catch (e: any) {
      toast({
        title: "Auto Match failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setIsAutoMatching(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const hay = `${t.description} ${t.vendor_clean ?? ""}`.toLowerCase();
    const matchesSearch = hay.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const isMatched = matches.some((m) => m.transaction_id === t.id);

    if (filterStatus === "matched") return isMatched;
    if (filterStatus === "unmatched") return !isMatched;

    if (filterStatus === "recent") {
      const d = new Date(t.txn_date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      return d >= cutoff;
    }

    return true;
  });

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            Showing up to 500 transactions for your selected date window
            {dateWindow.from && dateWindow.to ? ` (${dateWindow.from} → ${dateWindow.to})` : ""}
          </p>
        </div>

        {currentOrg && (
          <div className="space-y-4">
            <CSVUploader orgId={currentOrg.id} onUploadComplete={fetchTransactions} />
            <BankSyncSection orgId={currentOrg.id} onSyncComplete={fetchTransactions} />
          </div>
        )}

        <Card className="p-6 space-y-4">
          <TransactionFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
            dateMode={dateMode}
            onDateModeChange={setDateMode}
            monthValue={monthValue}
            onMonthChange={setMonthValue}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <TransactionSummary
            transactions={filteredTransactions as any}
            matches={matches as any}
            onUploadReceipt={handleUploadReceipt}
            onApplyRules={handleApplyRules}
            onAutoMatch={handleAutoMatch}
            isApplyingRules={isApplyingRules}
            isAutoMatching={isAutoMatching}
          />

          {/* ✅ Buttons back (in case your TransactionSummary layout doesn’t show them) */}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleAutoMatch} disabled={isAutoMatching}>
              {isAutoMatching ? "Auto Matching..." : "Auto Match"}
            </Button>
            <Button variant="outline" onClick={handleApplyRules} disabled={isApplyingRules}>
              {isApplyingRules ? "Applying Rules..." : "Apply Rules"}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Linked Receipt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground h-32">
                      No transactions found in this range
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((txn) => (
                    <TransactionRow
                      key={txn.id}
                      transaction={txn as any}
                      matches={matches as any}
                      linkedReceipts={linkedReceipts as any}
                      selectedReceiptId={selectedReceiptId}
                      onLinkReceipt={handleLinkReceipt}
                      onUnlinkReceipt={handleUnlinkReceipt}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-muted-foreground">
            Tip: Use <b>This Month</b> first while you import. Once it looks good, switch months and import the next batch.
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
