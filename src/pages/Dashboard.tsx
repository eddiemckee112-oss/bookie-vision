import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import DateRangeControls from "@/components/dashboard/DateRangeControls";
import KPICards from "@/components/dashboard/KPICards";
import CashFlowChart from "@/components/dashboard/CashFlowChart";
import SpendingByCategoryChart from "@/components/dashboard/SpendingByCategoryChart";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import { format } from "date-fns";

const PAGE_SIZE = 1000;

const Dashboard = () => {
  const { currentOrg, user, loading: orgLoading } = useOrg();
  const navigate = useNavigate();

  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  // NEW: category filter (applies to all KPI + charts + tables)
  const [categoryFilter, setCategoryFilter] = useState<string>("All Categories");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [kpiData, setKpiData] = useState<any>(null);
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const normalizedCategoryFilter = useMemo(() => {
    const v = (categoryFilter || "").trim();
    return v === "" ? "All Categories" : v;
  }, [categoryFilter]);

  useEffect(() => {
    if (orgLoading) return;

    // Check authentication first
    if (!user) {
      navigate("/auth");
      return;
    }

    // Then check for organization
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, user, orgLoading, navigate, fromDate, toDate, normalizedCategoryFilter]);

  const fetchDashboardData = async () => {
    if (!currentOrg) return;
    setLoading(true);

    try {
      await Promise.all([
        fetchAvailableCategories(), // NEW
        fetchKPIData(),
        fetchCashFlowData(),
        fetchCategoryData(),
        fetchTransactions(),
        fetchMatchedPairs(),
        fetchReceipts(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const applyDateFilters = (query: any, dateField: string) => {
    if (fromDate) query = query.gte(dateField, format(fromDate, "yyyy-MM-dd"));
    if (toDate) query = query.lte(dateField, format(toDate, "yyyy-MM-dd"));
    return query;
  };

  const applyCategoryFilter = (query: any) => {
    if (normalizedCategoryFilter && normalizedCategoryFilter !== "All Categories") {
      // Both receipts + transactions use "category"
      query = query.eq("category", normalizedCategoryFilter);
    }
    return query;
  };

  // Fetch ALL rows (no 1000 cap) by paging with range()
  const fetchAllRows = async <T,>({
    table,
    select,
    dateField,
    orderBy,
    ascending = true,
    extraFilters,
  }: {
    table: string;
    select: string;
    dateField?: string;
    orderBy?: string;
    ascending?: boolean;
    extraFilters?: (q: any) => any;
  }): Promise<T[]> => {
    if (!currentOrg) return [];

    const all: T[] = [];
    let offset = 0;

    while (true) {
      let q = supabase.from(table).select(select).eq("org_id", currentOrg.id);

      if (dateField) q = applyDateFilters(q, dateField);
      if (extraFilters) q = extraFilters(q);
      if (orderBy) q = q.order(orderBy, { ascending });

      q = q.range(offset, offset + PAGE_SIZE - 1);

      const { data, error } = await q;
      if (error) throw error;

      const chunk = (data as T[]) || [];
      all.push(...chunk);

      if (chunk.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return all;
  };

  // NEW: Build the category dropdown options (from receipts + transactions in current date range)
  const fetchAvailableCategories = async () => {
    if (!currentOrg) return;

    // Pull just category fields (paged) within date range (no category filter here!)
    const [receiptCats, txnCats] = await Promise.all([
      fetchAllRows<any>({
        table: "receipts",
        select: "category, receipt_date",
        dateField: "receipt_date",
        orderBy: "receipt_date",
        ascending: true,
      }),
      fetchAllRows<any>({
        table: "transactions",
        select: "category, txn_date",
        dateField: "txn_date",
        orderBy: "txn_date",
        ascending: true,
      }),
    ]);

    const set = new Set<string>();
    receiptCats?.forEach((r: any) => {
      const c = (r.category || "").trim();
      if (c) set.add(c);
    });
    txnCats?.forEach((t: any) => {
      const c = (t.category || "").trim();
      if (c) set.add(c);
    });

    setAvailableCategories(Array.from(set).sort((a, b) => a.localeCompare(b)));
  };

  const fetchKPIData = async () => {
    if (!currentOrg) return;

    // Receipts (apply category filter)
    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, total, tax, subtotal, receipt_date, category",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: true,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const receiptsCount = receiptsData?.length || 0;
    const receiptsTotal =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.total || 0), 0) || 0;
    const receiptsTax =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.tax || 0), 0) || 0;
    const receiptsSubtotal =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.subtotal || 0), 0) || 0;

    // Transactions (apply category filter)
    const transactionsData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, amount, direction, txn_date, category",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: true,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const transactionsCount = transactionsData?.length || 0;

    const transactionsDebits =
      transactionsData
        ?.filter((t: any) => t.direction === "debit")
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0) || 0;

    const transactionsCredits =
      transactionsData
        ?.filter((t: any) => t.direction === "credit")
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0) || 0;

    const transactionsNet = transactionsCredits - transactionsDebits;

    // Matches (org-wide; then we count matched within the *filtered* sets)
    const matchesData = await fetchAllRows<any>({
      table: "matches",
      select: "receipt_id, transaction_id",
    });

    const matchedReceiptIds = new Set(matchesData?.map((m: any) => m.receipt_id) || []);
    const matchedTransactionIds = new Set(matchesData?.map((m: any) => m.transaction_id) || []);

    const receiptsMatched =
      receiptsData?.filter((r: any) => matchedReceiptIds.has(r.id)).length || 0;

    const transactionsMatched =
      transactionsData?.filter((t: any) => matchedTransactionIds.has(t.id)).length || 0;

    setKpiData({
      // optional: show what filter is active (KPICards can ignore it if it doesn't use it)
      activeCategoryFilter: normalizedCategoryFilter,

      receiptsCount,
      receiptsSubtotal,
      receiptsTax,
      receiptsTotal,
      receiptsMatched,
      receiptsUnmatched: receiptsCount - receiptsMatched,

      transactionsCount,
      transactionsDebits,
      transactionsCredits,
      transactionsNet,

      transactionsMatched,
      transactionsUnmatched: transactionsCount - transactionsMatched,
    });
  };

  const fetchCashFlowData = async () => {
    if (!currentOrg) return;

    // Transactions for cashflow (apply category filter)
    const data = await fetchAllRows<any>({
      table: "transactions",
      select: "txn_date, amount, direction, category",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: true,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const dailyData = new Map<string, { debits: number; credits: number }>();

    data?.forEach((txn: any) => {
      const date = txn.txn_date;
      if (!dailyData.has(date)) dailyData.set(date, { debits: 0, credits: 0 });
      const day = dailyData.get(date)!;

      if (txn.direction === "debit") day.debits += txn.amount || 0;
      else day.credits += txn.amount || 0;
    });

    const chartData = Array.from(dailyData.entries())
      .map(([date, values]) => ({
        date,
        debits: -values.debits,
        credits: values.credits,
        net: values.credits - values.debits,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setCashFlowData(chartData);
  };

  const fetchCategoryData = async () => {
    if (!currentOrg) return;

    // If a category filter is selected, it doesn't really make sense to show "Spending by Category"
    // (it would basically show one bar). We'll still support it but it will collapse.
    const data = await fetchAllRows<any>({
      table: "receipts",
      select: "category, total, receipt_date",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: true,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const categoryMap = new Map<string, number>();
    data?.forEach((r: any) => {
      const cat = r.category || "Uncategorized";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + (r.total || 0));
    });

    const chartData = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    setCategoryData(chartData);
  };

  const fetchTransactions = async () => {
    if (!currentOrg) return;

    const txnData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, txn_date, description, amount, category, source_account_name, direction",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: false,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const matchesData = await fetchAllRows<any>({
      table: "matches",
      select: "transaction_id",
    });

    const matchedTxnIds = new Set(matchesData?.map((m: any) => m.transaction_id) || []);

    const enrichedData =
      txnData?.map((txn: any) => ({
        ...txn,
        isMatched: matchedTxnIds.has(txn.id),
      })) || [];

    setTransactions(enrichedData);
  };

  const fetchMatchedPairs = async () => {
    if (!currentOrg) return;

    const matchesData = await fetchAllRows<any>({
      table: "matches",
      select: "id, created_at, confidence, method, receipt_id, transaction_id",
      orderBy: "created_at",
      ascending: false,
    });

    if (!matchesData || matchesData.length === 0) {
      setMatchedPairs([]);
      return;
    }

    const receiptIds = Array.from(new Set(matchesData.map((m: any) => m.receipt_id)));
    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, receipt_date, vendor, total, category",
      extraFilters: (q) => {
        q = q.in("id", receiptIds);
        // Apply category filter to matched pairs via RECEIPT category
        q = applyCategoryFilter(q);
        return q;
      },
    });

    // Only keep matches whose receipt survived the category filter
    const allowedReceiptIds = new Set(receiptsData?.map((r: any) => r.id) || []);
    const filteredMatches = matchesData.filter((m: any) => allowedReceiptIds.has(m.receipt_id));

    if (filteredMatches.length === 0) {
      setMatchedPairs([]);
      return;
    }

    const txnIds = Array.from(new Set(filteredMatches.map((m: any) => m.transaction_id)));
    const txnData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, txn_date, description, amount, category",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: false,
      extraFilters: (q) => {
        q = q.in("id", txnIds);
        // Also apply category filter to transactions (keeps behavior consistent)
        q = applyCategoryFilter(q);
        return q;
      },
    });

    const receiptsMap = new Map(receiptsData?.map((r: any) => [r.id, r]) || []);
    const txnMap = new Map(txnData?.map((t: any) => [t.id, t]) || []);

    const pairs = filteredMatches
      .filter((m: any) => txnMap.has(m.transaction_id))
      .map((m: any) => {
        const receipt = receiptsMap.get(m.receipt_id);
        const txn = txnMap.get(m.transaction_id);
        return {
          id: m.id,
          created_at: m.created_at,
          receipt_date: receipt?.receipt_date || "",
          receipt_vendor: receipt?.vendor || "",
          receipt_total: receipt?.total || 0,
          txn_date: txn?.txn_date || "",
          txn_description: txn?.description || "",
          txn_amount: txn?.amount || 0,
          confidence: m.confidence,
          method: m.method,
        };
      });

    setMatchedPairs(pairs);
  };

  const fetchReceipts = async () => {
    if (!currentOrg) return;

    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, receipt_date, vendor, total, category, source",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: false,
      extraFilters: (q) => applyCategoryFilter(q),
    });

    const matchesData = await fetchAllRows<any>({
      table: "matches",
      select: "receipt_id",
    });

    const matchedReceiptIds = new Set(matchesData?.map((m: any) => m.receipt_id) || []);

    const enrichedData =
      receiptsData?.map((r: any) => ({
        ...r,
        isMatched: matchedReceiptIds.has(r.id),
      })) || [];

    setReceipts(enrichedData);
  };

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!currentOrg) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Accounting control center • Real-time financial overview</p>
        </div>

        <div className="bg-card border rounded-lg p-4 space-y-4">
          <DateRangeControls
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
          />

          {/* NEW: Category filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">Filter everything by category</div>

            <select
              className="h-10 w-full sm:w-[320px] rounded-md border bg-background px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="All Categories">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading dashboard data...</div>
        ) : (
          <>
            {kpiData && <KPICards data={kpiData} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <CashFlowChart data={cashFlowData} />
              <SpendingByCategoryChart data={categoryData} />
            </div>

            <DashboardTabs transactions={transactions} matchedPairs={matchedPairs} receipts={receipts} />
          </>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
