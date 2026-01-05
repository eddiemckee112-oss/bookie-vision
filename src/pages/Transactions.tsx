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

type OrgCategory = {
  id: string;
  org_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

// ✅ vendor_rules row
type VendorRuleRow = {
  vendor_pattern: string;
  category: string | null;
  direction_filter: string | null;
};

// ✅ optional rules row (safe if table exists)
type RuleRow = {
  match_pattern: string;
  default_category: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const safeRegexTest = (pattern: string, text: string) => {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return false;
  }
};

const isSquareIncome = (txn: { description: string; direction: string }) => {
  if (txn.direction !== "credit") return false;
  return /square/i.test(txn.description);
};

const pickCategoryFromRules = (
  txn: { description: string; vendor_clean?: string | null; direction: string },
  vendorRules: VendorRuleRow[],
  rules: RuleRow[],
) => {
  // 1) Square credits => Sales Income (if you like this behavior)
  if (isSquareIncome(txn)) return "Sales Income";

  // 2) vendor_rules first (most specific)
  for (const vr of vendorRules) {
    const matchesVendor =
      safeRegexTest(vr.vendor_pattern, txn.description) ||
      (txn.vendor_clean ? safeRegexTest(vr.vendor_pattern, txn.vendor_clean) : false);

    const matchesDirection = !vr.direction_filter || vr.direction_filter === txn.direction;

    if (matchesVendor && matchesDirection) return vr.category || null;
  }

  // 3) optional fallback rules table (if it exists + enabled rules live there)
  for (const r of rules) {
    const matches =
      safeRegexTest(r.match_pattern, txn.description) ||
      (txn.vendor_clean ? safeRegexTest(r.match_pattern, txn.vendor_clean) : false);

    if (matches) return r.default_category || null;
  }

  return null;
};

const Transactions = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedReceipts, setLinkedReceipts] = useState<Record<string, LinkedReceipt>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

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

  // ✅ org categories (from DB)
  const [orgCategories, setOrgCategories] = useState<OrgCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [showManageCats, setShowManageCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  // ✅ Apply Rules busy state
  const [isApplyingRules, setIsApplyingRules] = useState(false);

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

    fetchTransactions();
    fetchMatches();
    loadOrgCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, orgLoading, navigate, dateMode, monthValue, startDate, endDate]);

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

    setTransactions((prev) => prev.map((t) => (t.id === txnId ? { ...t, category: newCategory } : t)));
    setUpdatingCategoryId(null);
  };

  const deleteTransaction = async (txnId: string) => {
    if (!currentOrg) return;

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

  // ✅ APPLY RULES (real)
  const applyRules = async () => {
    if (!currentOrg) return;

    setIsApplyingRules(true);
    try {
      // ensure latest categories
      const { data: catsRaw, error: catsErr } = await supabase
        .from("org_categories")
        .select("id,org_id,name,sort_order,is_active")
        .eq("org_id", currentOrg.id)
        .eq("is_active", true);

      if (catsErr) throw catsErr;

      const allowed = new Set<string>((catsRaw as any[] | null)?.map((c) => c.name) ?? []);
      allowed.add("Uncategorized");

      // vendor_rules (primary)
      const { data: vendorRulesRaw, error: vrErr } = await supabase
        .from("vendor_rules")
        .select("vendor_pattern, category, direction_filter")
        .eq("org_id", currentOrg.id);

      if (vrErr) throw vrErr;

      // optional rules table (ignore if missing)
      let rules: RuleRow[] = [];
      try {
        const { data: rulesRaw, error: rErr } = await supabase
          .from("rules")
          .select("match_pattern, default_category")
          .eq("org_id", currentOrg.id)
          .eq("enabled", true);

        if (!rErr && rulesRaw) rules = rulesRaw as any;
      } catch {
        // ignore
      }

      const vendorRules = (vendorRulesRaw || []) as VendorRuleRow[];

      // pull candidate txns (only blanks in the current window)
      let q = supabase
        .from("transactions")
        .select("id, description, vendor_clean, direction, category, txn_date")
        .eq("org_id", currentOrg.id);

      if (dateWindow.from) q = q.gte("txn_date", dateWindow.from);
      if (dateWindow.to) q = q.lte("txn_date", dateWindow.to);

      // only fill blanks/unclassified
      q = q.or("category.is.null,category.eq.,category.eq.Uncategorized");

      const { data: txRaw, error: txErr } = await q.order("txn_date", { ascending: false }).limit(5000);
      if (txErr) throw txErr;

      const txns = (txRaw || []) as Array<{
        id: string;
        description: string;
        vendor_clean: string | null;
        direction: string;
        category: string | null;
      }>;

      if (txns.length === 0) {
        toast({ title: "Apply Rules", description: "Nothing to update in this date window." });
        return;
      }

      const updates = txns
        .map((t) => {
          const computed = pickCategoryFromRules(
            { description: t.description, vendor_clean: t.vendor_clean, direction: t.direction },
            vendorRules,
            rules,
          );

          const finalCat = computed && allowed.has(computed) ? computed : "Uncategorized";
          const current = (t.category ?? "") || "Uncategorized";

          if (finalCat === current) return null;
          return { id: t.id, category: finalCat };
        })
        .filter(Boolean) as Array<{ id: string; category: string }>;

      if (updates.length === 0) {
        toast({ title: "Apply Rules", description: "No changes needed." });
        return;
      }

      // update in small batches
      let updated = 0;
      const batches = chunk(updates, 25);

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (u) => {
            const { error } = await supabase
              .from("transactions")
              .update({ category: u.category })
              .eq("org_id", currentOrg.id)
              .eq("id", u.id);

            if (!error) updated += 1;
          }),
        );
      }

      toast({ title: "Apply Rules complete", description: `Updated ${updated} transaction(s).` });

      // refresh UI data + category dropdown list
      await loadOrgCategories();
      await fetchTransactions();
    } catch (e: any) {
      console.error("Apply rules failed:", e);
      toast({
        title: "Apply Rules failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsApplyingRules(false);
    }
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Categories: <b>{orgCategories.length}</b>
              {catLoading ? " (loading...)" : ""}
            </div>

            <Button variant="outline" onClick={() => setShowManageCats((v) => !v)}>
              {showManageCats ? "Hide Category Manager" : "Manage Categories"}
            </Button>
          </div>

          {showManageCats && (
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
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="text-sm">
                        <b>{c.name}</b>{" "}
                        <span className="text-xs text-muted-foreground">({c.sort_order})</span>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteCategory(c.id, c.name)}
                      >
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
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: "Auto Match (later)",
                    description: "Finish importing months first.",
                  })
                }
              >
                Auto Match
              </Button>

              <Button variant="outline" onClick={applyRules} disabled={isApplyingRules}>
                {isApplyingRules ? "Applying..." : "Apply Rules"}
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

                    const legacyCategory =
                      txn.category && !categoryNames.includes(txn.category) ? txn.category : null;

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

                        <TableCell className="min-w-[240px]">
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={txn.category ?? ""}
                            disabled={updatingCategoryId === txn.id}
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

                        <TableCell className="whitespace-nowrap">{txn.source_account_name || "—"}</TableCell>

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
