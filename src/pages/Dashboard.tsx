import { useEffect, useState } from "react";
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
  const [kpiData, setKpiData] = useState<any>(null);
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, [currentOrg, user, orgLoading, navigate, fromDate, toDate]);

  const fetchDashboardData = async () => {
    if (!currentOrg) return;
    setLoading(true);

    try {
      await Promise.all([
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

  const fetchKPIData = async () => {
    if (!currentOrg) return;

    // Fetch ALL receipts in range (avoid 1000 cap)
    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, total, tax, subtotal, receipt_date",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: true,
    });

    const receiptsCount = receiptsData?.length || 0;
    const receiptsTotal =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.total || 0), 0) || 0;
    const receiptsTax =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.tax || 0), 0) || 0;
    const receiptsSubtotal =
      receiptsData?.reduce((sum: number, r: any) => sum + (r.subtotal || 0), 0) || 0;

    // Fetch ALL transactions in range (avoid 1000 cap)
    const transactionsData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, amount, direction, txn_date",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: true,
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

    // NEW: net (profit/loss style) for selected range
    const transactionsNet = transactionsCredits - transactionsDebits;

    // Fetch ALL matches for org (no date filter here because matches link ids)
    const matchesData = await fetchAllRows<any>({
      table: "matches",
      select: "receipt_id, transaction_id",
      // no dateField on matches (keep it simple + correct)
    });

    const matchedReceiptIds = new Set(matchesData?.map((m: any) => m.receipt_id) || []);
    const matchedTransactionIds = new Set(matchesData?.map((m: any) => m.transaction_id) || []);

    // Count matched receipts/transactions in THIS period
    const receiptsMatched =
      receiptsData?.filter((r: any) => matchedReceiptIds.has(r.id)).length || 0;

    const transactionsMatched =
      transactionsData?.filter((t: any) => matchedTransactionIds.has(t.id)).length || 0;

    setKpiData({
      receiptsCount,
      receiptsSubtotal,
      receiptsTax,
      receiptsTotal,
      receiptsMatched,
      receiptsUnmatched: receiptsCount - receiptsMatched,

      transactionsCount,
      transactionsDebits,
      transactionsCredits,

      // NEW totals you asked for:
      transactionsNet, // credits - debits for the selected range

      transactionsMatched,
      transactionsUnmatched: transactionsCount - transactionsMatched,
    });
  };

  const fetchCashFlowData = async () => {
    if (!currentOrg) return;

    // Fetch ALL transactions for cashflow (avoid 1000 cap)
    const data = await fetchAllRows<any>({
      table: "transactions",
      select: "txn_date, amount, direction",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: true,
    });

    // Group by date
    const dailyData = new Map<string, { debits: number; credits: number }>();

    data?.forEach((txn: any) => {
      const date = txn.txn_date;
      if (!dailyData.has(date)) {
        dailyData.set(date, { debits: 0, credits: 0 });
      }
      const day = dailyData.get(date)!;
      if (txn.direction === "debit") {
        day.debits += txn.amount || 0;
      } else {
        day.credits += txn.amount || 0;
      }
    });

    const chartData = Array.from(dailyData.entries())
      .map(([date, values]) => ({
        date,
        debits: -values.debits, // Show as negative for expenses
        credits: values.credits,
        net: values.credits - values.debits,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setCashFlowData(chartData);
  };

  const fetchCategoryData = async () => {
    if (!currentOrg) return;

    // Fetch ALL receipts for category spending (avoid 1000 cap)
    const data = await fetchAllRows<any>({
      table: "receipts",
      select: "category, total, receipt_date",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: true,
    });

    const categoryMap = new Map<string, number>();
    data?.forEach((r: any) => {
      const cat = r.category || "Uncategorized";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + (r.total || 0));
    });

    const chartData = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10

    setCategoryData(chartData);
  };

  const fetchTransactions = async () => {
    if (!currentOrg) return;

    // Fetch ALL transactions for the table (avoid 1000 cap + remove small limit)
    const txnData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, txn_date, description, amount, category, source_account_name, direction",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: false,
    });

    // Fetch ALL matches (avoid 1000 cap)
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

    // Fetch ALL matches (avoid 1000 cap). Keep newest first.
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

    // Fetch receipts for those match ids (no date filter here; we’ll filter by txn date like you had)
    const receiptIds = Array.from(new Set(matchesData.map((m: any) => m.receipt_id)));
    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, receipt_date, vendor, total",
      // IMPORTANT: do NOT date-filter receipts here; matches might link across dates
      extraFilters: (q) => q.in("id", receiptIds),
    });

    // Fetch transactions for those match ids WITH date filter (same behavior you had)
    const txnIds = Array.from(new Set(matchesData.map((m: any) => m.transaction_id)));
    const txnData = await fetchAllRows<any>({
      table: "transactions",
      select: "id, txn_date, description, amount",
      dateField: "txn_date",
      orderBy: "txn_date",
      ascending: false,
      extraFilters: (q) => q.in("id", txnIds),
    });

    const receiptsMap = new Map(receiptsData?.map((r: any) => [r.id, r]) || []);
    const txnMap = new Map(txnData?.map((t: any) => [t.id, t]) || []);

    const pairs = matchesData
      .filter((m: any) => txnMap.has(m.transaction_id)) // Only include if transaction is in date range
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

    // Fetch ALL receipts for the table (avoid 1000 cap + remove small limit)
    const receiptsData = await fetchAllRows<any>({
      table: "receipts",
      select: "id, receipt_date, vendor, total, category, source",
      dateField: "receipt_date",
      orderBy: "receipt_date",
      ascending: false,
    });

    // Fetch ALL matches (avoid 1000 cap)
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

        <div className="bg-card border rounded-lg p-4">
          <DateRangeControls
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
          />
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
