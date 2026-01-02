import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import CSVUploader from "@/components/transactions/CSVUploader";
import TransactionFilters from "@/components/transactions/TransactionFilters";
import BankSyncSection from "@/components/transactions/BankSyncSection";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  vendor_clean: string | null;
  amount: number;
  direction: string; // "debit" | "credit"
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

// ✅ Tight category list (accountant-friendly)
// You can tweak these labels anytime.
const CATEGORY_OPTIONS = [
  "Sales Income",
  "Other Income",
  "Restaurant Food & Supplies",
  "Restaurant Supplies",
  "Cleaning Supplies",
  "Building Supplies",
  "Tools & Equipment",
  "General Supplies",
  "Utilities",
  "Rent / Lease",
  "Insurance",
  "Repairs & Maintenance",
  "Payroll",
  "Fuel / Auto",
  "Software & Subscriptions",
  "Professional Fees",
  "Taxes & Government",
  "Owner Draw / Personal",
];

const Transactions = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedReceipts, setLinkedReceipts] = useState<Record<string, LinkedReceipt>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Linking flow (keep this for later matching)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // ✅ date filtering
  const [dateMode, setDateMode] = useState<DateMode>("this_month");
  const [monthValue, setMonthValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`; // YYYY-MM
  });
  const [startDate, setStartDate] = useState(() => toYMD(firstDayOfMonth(new Date())));
  const [endDate, setEndDate] = useState(() => toYMD(lastDayOfMonth(new Date())));

  // ✅ per-row busy states
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dateWindow = useMemo(() => {
    const now = new Date();

    if (dateMode === "all") return { from: null as string | null, to: null as string | null };

    if (dateMode === "this_month") {
      const from = toYMD(firstDayOfMonth(now));
      const to = toYMD(lastDayOfMonth(now));
      return { from, to };
    }

    if (dateMode === "last_month") {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const from = toYMD(firstDayOfMonth(lastMonth));
      const to = toYMD(lastDayOfMonth(lastMonth));
      return { from, to };
    }

    if (dateMode === "month") {
      const [y, m] = monthValue.split("-").map(Number);
      const d = new Date(y, (m || 1) - 1, 1);
      const from = toYMD(firstDayOfMonth(d));
      const to = toYMD(lastDayOfMonth(d));
      return { from, to };
    }

    // range
    return {
      from: startDate || null,
      to: endDate || null,
    };
  }, [dateMode, monthValue, startDate, endDate]);

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    // keep existing "link receipt -> go to transactions" flow
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

    setMatches((matchesData as any) || []);

    const receiptIds = matchesData?.map((m) => m.receipt_id) || [];
    if (receiptIds.length > 0) {
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("receipts")
        .select("id, vendor, image_url, total")
        .in("id", receiptIds);

      if (!receiptsError && receiptsData) {
        const receiptsMap: Record<string, LinkedReceipt> = {};
        receiptsData.forEach((receipt: any) => {
          receiptsMap[receipt.id] = receipt;
        });
        setLinkedReceipts(receiptsMap);
      }
    }
  };

  const isTxnMatched = (txnId: string) => matches.some((m) => m.transaction_id === txnId);

  const getLinkedReceiptForTxn = (txnId: string) => {
    const m = matches.find((x) => x.transaction_id === txnId);
    if (!m) return null;
    return linkedReceipts[m.receipt_id] || null;
  };

  const handleUploadReceipt = (txnId?: string) => {
    // Optional: you can use this later if you want the receipts page to “know” which txn you came from.
    if (txnId) sessionStorage.setItem("linkTransaction", txnId);
    navigate("/receipts");
  };

  // ✅ Edit category (updates DB + updates UI)
  const updateCategory = async (txnId: string, newCategory: string | null) => {
    if (!currentOrg) return;

    setUpdatingCategoryId(txnId);

    const { error } = await supabase
      .from("transactions")
      .update({ category: newCategory })
      .eq("id", txnId)
      .eq("org_id", currentOrg.id);

    if (error) {
      toast({
        title: "Failed to update category",
        description: error.message,
        variant: "destructive",
      });
      setUpdatingCategoryId(null);
      return;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, category: newCategory } : t)),
    );

    setUpdatingCategoryId(null);
  };

  // ✅ Delete transaction (deletes match row first to avoid FK issues)
  const deleteTransaction = async (txnId: string) => {
    if (!currentOrg) return;

    const ok = window.confirm("Delete this transaction? This cannot be undone.");
    if (!ok) return;

    setDeletingId(txnId);

    // 1) delete any match rows first (safe even if none exist)
    const { error: mErr } = await supabase
      .from("matches")
      .delete()
      .eq("org_id", currentOrg.id)
      .eq("transaction_id", txnId);

    if (mErr) {
      toast({
        title: "Delete failed (matches)",
        description: mErr.message,
        variant: "destructive",
      });
      setDeletingId(null);
      return;
    }

    // 2) delete the transaction
    const { error: tErr } = await supabase
      .from("transactions")
      .delete()
      .eq("org_id", currentOrg.id)
      .eq("id", txnId);

    if (tErr) {
      toast({
        title: "Delete failed",
        description: tErr.message,
        variant: "destructive",
      });
      setDeletingId(null);
      return;
    }

    // 3) remove from UI
    setTransactions((prev) => prev.filter((t) => t.id !== txnId));
    setMatches((prev) => prev.filter((m) => m.transaction_id !== txnId));

    toast({ title: "Transaction deleted" });
    setDeletingId(null);
  };

  const filteredTransactions = transactions.filter((t) => {
    const hay = `${t.description} ${t.vendor_clean ?? ""}`.toLowerCase();
    const matchesSearch = hay.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const matched = isTxnMatched(t.id);
    if (filterStatus === "matched") return matched;
    if (filterStatus === "unmatched") return !matched;

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

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Showing <b>{filteredTransactions.length}</b> transactions
            </div>

            <div className="flex gap-2">
              {/* Matching on hold - keep buttons optional (you can ignore them) */}
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: "Auto Match is on hold",
                    description: "We’ll do matching after you import a few months.",
                  })
                }
              >
                Auto Match
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: "Apply Rules is on hold",
                    description: "We’ll do rules after you import a few months.",
                  })
                }
              >
                Apply Rules
              </Button>
            </div>
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
                  filteredTransactions.map((txn) => {
                    const matched = isTxnMatched(txn.id);
                    const receipt = getLinkedReceiptForTxn(txn.id);

                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap">{txn.txn_date}</TableCell>

                        <TableCell className="min-w-[360px]">
                          <div className="font-medium">{txn.description}</div>
                          {txn.vendor_clean ? (
                            <div className="text-xs text-muted-foreground">{txn.vendor_clean}</div>
                          ) : null}
                        </TableCell>

                        <TableCell className="text-right whitespace-nowrap">
                          ${Number(txn.amount ?? 0).toFixed(2)}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                            {txn.direction}
                          </span>
                        </TableCell>

                        {/* ✅ Editable category */}
                        <TableCell className="min-w-[220px]">
                          <Select
                            value={txn.category ?? ""}
                            onValueChange={(v) => updateCategory(txn.id, v || null)}
                            disabled={updatingCategoryId === txn.id}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Uncategorized" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Uncategorized</SelectItem>
                              {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {txn.source_account_name || "—"}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {receipt ? (
                            <span className="text-sm">{receipt.vendor || "Receipt linked"}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No receipt</span>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                              matched ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {matched ? "Matched" : "Unmatched"}
                          </span>
                        </TableCell>

                        {/* ✅ Actions: Upload Receipt + Delete (last column) */}
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUploadReceipt(txn.id)}
                            >
                              Upload Receipt
                            </Button>

                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteTransaction(txn.id)}
                              disabled={deletingId === txn.id}
                            >
                              {deletingId === txn.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-muted-foreground">
            Tip: Import <b>This Month</b> first. Once it looks good, switch months and import the next batch.
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
