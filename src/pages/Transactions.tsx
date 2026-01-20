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

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  vendor_clean: string | null;
  amount: number;
  direction: string; // "debit" | "credit"
  category: string | null;
  source_account_name: string | null;
  account_id?: string | null;
  created_at?: string;
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

interface VendorRule {
  id: string;
  vendor_pattern: string;
  category: string | null;
  auto_match: boolean;
  source: string | null;
  direction_filter: string | null;
}

type DateMode = "this_month" | "last_month" | "month" | "range" | "all";

type OrgCategory = {
  id: string;
  org_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type AccountRow = {
  id: string;
  name: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
const isEmptyCategory = (cat: string | null) => {
  const v = norm(cat);
  return v === "" || v === "uncategorized" || v === "un-categorized";
};

const PAGE_SIZE = 500;

const Transactions = () => {
  const { currentOrg, loading: orgLoading, orgRole } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const canManage = useMemo(() => orgRole === "owner" || orgRole === "admin", [orgRole]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedReceipts, setLinkedReceipts] = useState<Record<string, LinkedReceipt>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // ✅ NEW: category filter (text match on txn.category)
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // date filtering
  const [dateMode, setDateMode] = useState<DateMode>("this_month");
  const [monthValue, setMonthValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  });
  const [startDate, setStartDate] = useState(() => toYMD(firstDayOfMonth(new Date())));
  const [endDate, setEndDate] = useState(() => toYMD(lastDayOfMonth(new Date())));

  // per-row busy
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // org categories (from DB)
  const [orgCategories, setOrgCategories] = useState<OrgCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  // Apply Rules busy
  const [isApplyingRules, setIsApplyingRules] = useState(false);

  // Accounts + account filter
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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

    return { from: startDate || null, to: endDate || null };
  }, [dateMode, monthValue, startDate, endDate]);

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    // reset paging whenever org/date/account changes
    setPage(0);
    setHasMore(true);

    fetchTransactions({ reset: true });
    fetchMatches();
    loadOrgCategories();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, orgLoading, navigate, dateMode, monthValue, startDate, endDate, selectedAccountId]);

  const loadAccounts = async () => {
    if (!currentOrg) return;
    setAccountsLoading(true);

    const { data, error } = await supabase
      .from("accounts")
      .select("id,name")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setAccountsLoading(false);

    if (error) {
      toast({
        title: "Could not load accounts",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setAccounts((data as any) || []);
  };

  const loadOrgCategories = async () => {
    if (!currentOrg) return;
    setCatLoading(true);

    const { data, error } = await supabase
      .from("org_categories")
      .select("id,org_id,name,sort_order,is_active")
      .eq("org_id", currentOrg.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    setCatLoading(false);

    if (error) {
      toast({
        title: "Could not load categories",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setOrgCategories((data as any) || []);
  };

  const addCategory = async () => {
    if (!currentOrg) return;

    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Staff cannot manage categories.",
        variant: "destructive",
      });
      return;
    }

    const name = newCatName.trim();
    if (!name) {
      toast({ title: "Category name is required", variant: "destructive" });
      return;
    }

    setCatSaving(true);

    const nextSort =
      orgCategories.length > 0
        ? Math.max(...orgCategories.map((c) => c.sort_order || 100)) + 10
        : 100;

    const { error } = await supabase.from("org_categories").insert({
      org_id: currentOrg.id,
      name,
      sort_order: nextSort,
      is_active: true,
    });

    setCatSaving(false);

    if (error) {
      toast({
        title: "Failed to add category",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setNewCatName("");
    await loadOrgCategories();
    toast({ title: "Category added" });
  };

  const deleteCategory = async (catId: string, name: string) => {
    if (!currentOrg) return;

    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Staff cannot manage categories.",
        variant: "destructive",
      });
      return;
    }

    const ok = window.confirm(
      `Delete category "${name}"?\n\nTransactions will keep their text value, but the category won't show in the dropdown anymore.`,
    );
    if (!ok) return;

    const { error } = await supabase
      .from("org_categories")
      .delete()
      .eq("org_id", currentOrg.id)
      .eq("id", catId);

    if (error) {
      toast({
        title: "Failed to delete category",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    await loadOrgCategories();
    toast({ title: "Category deleted" });
  };

  const fetchTransactions = async (opts?: { reset?: boolean }) => {
    if (!currentOrg) return;

    const reset = opts?.reset ?? true;
    const nextPage = reset ? 0 : page;

    const fromIdx = nextPage * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1;

    if (!reset) setIsLoadingMore(true);

    let q = supabase.from("transactions").select("*").eq("org_id", currentOrg.id);

    if (selectedAccountId !== "all") {
      q = q.eq("account_id", selectedAccountId);
    }

    if (dateWindow.from) q = q.gte("txn_date", dateWindow.from);
    if (dateWindow.to) q = q.lte("txn_date", dateWindow.to);

    const { data, error } = await q
      .order("txn_date", { ascending: false })
      .range(fromIdx, toIdx);

    if (!reset) setIsLoadingMore(false);

    if (error) {
      toast({
        title: "Error fetching transactions",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const rows = (data as any) || [];

    if (reset) {
      setTransactions(rows);
      setPage(1);
    } else {
      setTransactions((prev) => [...prev, ...rows]);
      setPage((p) => p + 1);
    }

    setHasMore(rows.length === PAGE_SIZE);
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

    const receiptIds = matchesData?.map((m: any) => m.receipt_id) || [];
    if (receiptIds.length > 0) {
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("receipts")
        .select("id, vendor, image_url, total")
        .in("id", receiptIds);

      if (!receiptsError && receiptsData) {
        const map: Record<string, LinkedReceipt> = {};
        receiptsData.forEach((r: any) => (map[r.id] = r));
        setLinkedReceipts(map);
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
    if (txnId) sessionStorage.setItem("linkTransaction", txnId);
    navigate("/receipts");
  };

  const updateCategory = async (txnId: string, newCategory: string | null) => {
    if (!currentOrg) return;

    // Staff read-only on transactions
    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Staff cannot edit transactions. Contact an admin/owner.",
        variant: "destructive",
      });
      return;
    }

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

  const deleteTransaction = async (txnId: string) => {
    if (!currentOrg) return;

    // Staff read-only on transactions
    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Staff cannot delete transactions. Contact an admin/owner.",
        variant: "destructive",
      });
      return;
    }

    const ok = window.confirm("Delete this transaction? This cannot be undone.");
    if (!ok) return;

    setDeletingId(txnId);

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

    setTransactions((prev) => prev.filter((t) => t.id !== txnId));
    setMatches((prev) => prev.filter((m) => m.transaction_id !== txnId));

    toast({ title: "Transaction deleted" });
    setDeletingId(null);
  };

  const categoryNames = useMemo(() => orgCategories.map((c) => c.name), [orgCategories]);

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
  }).filter((t) => {
    // ✅ NEW: category filter
    if (categoryFilter === "all") return true;

    // "Uncategorized" bucket
    if (categoryFilter === "__uncat__") return isEmptyCategory(t.category);

    // Exact match on category string
    return (t.category ?? "") === categoryFilter;
  });

  // Apply rules (works again)
  const applyRules = async () => {
    if (!currentOrg) return;

    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Staff cannot apply rules. Contact an admin/owner.",
        variant: "destructive",
      });
      return;
    }

    setIsApplyingRules(true);
    try {
      // 1) Load vendor rules
      const { data: rulesData, error: rulesError } = await supabase
        .from("vendor_rules")
        .select("id,vendor_pattern,category,auto_match,source,direction_filter")
        .eq("org_id", currentOrg.id)
        .order("created_at", { ascending: false });

      if (rulesError) throw rulesError;

      const rules = (rulesData as any as VendorRule[]) || [];
      if (rules.length === 0) {
        toast({ title: "No rules found", description: "Create vendor rules first." });
        return;
      }

      // 2) Decide changes in-memory (do NOT overwrite already-categorized)
      const updatesByCategory = new Map<string | null, string[]>(); // category -> txnIds

      const allowed = new Set(categoryNames.map((c) => norm(c)));

      const getCategoryIfAllowed = (cat: string | null): string | null => {
        if (!cat) return null;
        const c = cat.trim();
        if (!c) return null;
        // Only allow categories that exist in org_categories
        return allowed.has(norm(c)) ? c : null;
      };

      const matchesRule = (txn: Transaction, rule: VendorRule) => {
        const pat = norm(rule.vendor_pattern);
        if (!pat) return false;

        // Optional filters
        if (rule.source && norm(rule.source) !== norm(txn.source_account_name)) return false;
        if (rule.direction_filter && norm(rule.direction_filter) !== norm(txn.direction)) return false;

        const hay = `${txn.vendor_clean ?? ""} ${txn.description ?? ""}`.toLowerCase();
        return hay.includes(pat);
      };

      let proposedCount = 0;

      for (const txn of transactions) {
        // Only apply to uncategorized
        if (!isEmptyCategory(txn.category)) continue;

        const rule = rules.find((r) => matchesRule(txn, r));
        if (!rule) continue;

        const newCat = getCategoryIfAllowed(rule.category);
        // If rule category isn't in org_categories, we skip it to avoid junk categories
        if (!newCat) continue;

        proposedCount++;
        const list = updatesByCategory.get(newCat) ?? [];
        list.push(txn.id);
        updatesByCategory.set(newCat, list);
      }

      if (proposedCount === 0) {
        toast({
          title: "No changes",
          description:
            "No uncategorized transactions matched your rules (or rule categories aren’t in your category list).",
        });
        return;
      }

      // 3) Batch update by category (few calls)
      let updated = 0;
      for (const [cat, ids] of updatesByCategory.entries()) {
        // chunk in case you have tons
        const chunkSize = 200;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);

          const { error } = await supabase
            .from("transactions")
            .update({ category: cat })
            .eq("org_id", currentOrg.id)
            .in("id", chunk);

          if (error) throw error;
          updated += chunk.length;
        }
      }

      // 4) Refresh view (reset paging)
      setPage(0);
      setHasMore(true);
      await fetchTransactions({ reset: true });

      toast({
        title: "Rules applied",
        description: `Updated ${updated} transaction${updated === 1 ? "" : "s"}.`,
      });
    } catch (e: any) {
      toast({
        title: "Apply Rules failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsApplyingRules(false);
    }
  };

  // (Auto Match later)
  const autoMatch = () => {
    toast({
      title: "Auto Match (later)",
      description: "Finish importing months first.",
    });
  };

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            Showing up to {PAGE_SIZE} transactions per page for your selected date window
            {dateWindow.from && dateWindow.to ? ` (${dateWindow.from} → ${dateWindow.to})` : ""}
            {selectedAccountId !== "all" ? " (filtered by account)" : ""}
          </p>
        </div>

        {/* Owners/Admin only: import + bank sync */}
        {currentOrg && canManage && (
          <div className="space-y-4">
            <CSVUploader orgId={currentOrg.id} onUploadComplete={() => fetchTransactions({ reset: true })} />
            <BankSyncSection orgId={currentOrg.id} onSyncComplete={() => fetchTransactions({ reset: true })} />
          </div>
        )}

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Categories: <b>{orgCategories.length}</b>
              {catLoading ? " (loading...)" : ""}
            </div>

            {/* Owners/Admin only */}
            {canManage && (
              <Button variant="outline" onClick={() => setShowManageCats((v) => !v)}>
                {showManageCats ? "Hide Category Manager" : "Manage Categories"}
              </Button>
            )}
          </div>

          {/* Owners/Admin only */}
          {canManage && showManageCats && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="Add a category (ex: Restaurant Food & Supplies)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <Button onClick={addCategory} disabled={catSaving}>
                  {catSaving ? "Saving..." : "Add"}
                </Button>
                <Button variant="outline" onClick={loadOrgCategories}>
                  Refresh
                </Button>
              </div>

              {orgCategories.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No categories yet. Add a few — these will power your transaction dropdown.
                </div>
              ) : (
                <div className="grid gap-2">
                  {orgCategories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="text-sm">
                        <b>{c.name}</b>{" "}
                        <span className="text-xs text-muted-foreground">({c.sort_order})</span>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => deleteCategory(c.id, c.name)}>
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Note: Deleting a category won’t delete transactions. It just removes the option from the dropdown.
              </div>
            </div>
          )}

          {/* Account filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">Account:</div>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={accountsLoading}
            >
              <option value="all">{accountsLoading ? "Loading..." : "All"}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ NEW: Category filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">Category:</div>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="__uncat__">Uncategorized</option>
              {orgCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

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

            {/* Owners/Admin only */}
            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={autoMatch}>
                  Auto Match
                </Button>
                <Button variant="outline" onClick={applyRules} disabled={isApplyingRules}>
                  {isApplyingRules ? "Applying..." : "Apply Rules"}
                </Button>
              </div>
            )}
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
                    const matched = matches.some((m) => m.transaction_id === txn.id);
                    const m = matches.find((x) => x.transaction_id === txn.id);
                    const receipt = m ? linkedReceipts[m.receipt_id] || null : null;

                    const legacyCategory =
                      txn.category && !categoryNames.includes(txn.category) ? txn.category : null;

                    const uncategorized = isEmptyCategory(txn.category);

                    return (
                      <TableRow key={txn.id} className={uncategorized ? "bg-yellow-50" : ""}>
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
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                              norm(txn.direction) === "debit"
                                ? "bg-red-50 text-red-700"
                                : "bg-green-50 text-green-700"
                            }`}
                          >
                            {txn.direction}
                          </span>
                        </TableCell>

                        <TableCell className="min-w-[240px]">
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={txn.category ?? ""}
                            disabled={!canManage || updatingCategoryId === txn.id}
                            onChange={(e) => updateCategory(txn.id, e.target.value || null)}
                          >
                            <option value="">Uncategorized</option>

                            {legacyCategory ? (
                              <option value={legacyCategory}>{legacyCategory} (legacy)</option>
                            ) : null}

                            {orgCategories.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
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

                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleUploadReceipt(txn.id)}>
                              Upload Receipt
                            </Button>

                            {/* Owners/Admin only */}
                            {canManage && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteTransaction(txn.id)}
                                disabled={deletingId === txn.id}
                              >
                                {deletingId === txn.id ? "Deleting..." : "Delete"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchTransactions({ reset: false })}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Tip: Import <b>This Month</b> first. Once it looks good, switch months and import the next batch.
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
