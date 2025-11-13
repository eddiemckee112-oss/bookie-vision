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

const Dashboard = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
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
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchDashboardData();
  }, [currentOrg, orgLoading, navigate, fromDate, toDate]);

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

  const fetchKPIData = async () => {
    if (!currentOrg) return;

    // Fetch receipts
    let receiptsQuery = supabase
      .from("receipts")
      .select("id, total, tax, subtotal")
      .eq("org_id", currentOrg.id);

    if (fromDate) receiptsQuery = receiptsQuery.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) receiptsQuery = receiptsQuery.lte("receipt_date", format(toDate, "yyyy-MM-dd"));

    const { data: receiptsData } = await receiptsQuery;

    const receiptsCount = receiptsData?.length || 0;
    const receiptsTotal = receiptsData?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;
    const receiptsTax = receiptsData?.reduce((sum, r) => sum + (r.tax || 0), 0) || 0;
    const receiptsSubtotal = receiptsData?.reduce((sum, r) => sum + (r.subtotal || 0), 0) || 0;

    // Fetch transactions
    let transactionsQuery = supabase
      .from("transactions")
      .select("id, amount, direction")
      .eq("org_id", currentOrg.id);

    if (fromDate) transactionsQuery = transactionsQuery.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) transactionsQuery = transactionsQuery.lte("txn_date", format(toDate, "yyyy-MM-dd"));

    const { data: transactionsData } = await transactionsQuery;

    const transactionsCount = transactionsData?.length || 0;
    const transactionsDebits = transactionsData?.filter(t => t.direction === "debit").reduce((sum, t) => sum + t.amount, 0) || 0;
    const transactionsCredits = transactionsData?.filter(t => t.direction === "credit").reduce((sum, t) => sum + t.amount, 0) || 0;

    // Fetch matches
    const { data: matchesData } = await supabase
      .from("matches")
      .select("receipt_id, transaction_id")
      .eq("org_id", currentOrg.id);

    const matchedReceiptIds = new Set(matchesData?.map(m => m.receipt_id) || []);
    const matchedTransactionIds = new Set(matchesData?.map(m => m.transaction_id) || []);

    // Count matched receipts and transactions in this period
    const receiptsMatched = receiptsData?.filter((r: any) => 
      matchedReceiptIds.has(r.id)
    ).length || 0;

    const transactionsMatched = transactionsData?.filter((t: any) =>
      matchedTransactionIds.has(t.id)
    ).length || 0;

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
      transactionsMatched,
      transactionsUnmatched: transactionsCount - transactionsMatched,
    });
  };

  const fetchCashFlowData = async () => {
    if (!currentOrg) return;

    let query = supabase
      .from("transactions")
      .select("txn_date, amount, direction")
      .eq("org_id", currentOrg.id)
      .order("txn_date");

    if (fromDate) query = query.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) query = query.lte("txn_date", format(toDate, "yyyy-MM-dd"));

    const { data } = await query;

    // Group by date
    const dailyData = new Map<string, { debits: number; credits: number }>();

    data?.forEach((txn: any) => {
      const date = txn.txn_date;
      if (!dailyData.has(date)) {
        dailyData.set(date, { debits: 0, credits: 0 });
      }
      const day = dailyData.get(date)!;
      if (txn.direction === "debit") {
        day.debits += txn.amount;
      } else {
        day.credits += txn.amount;
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

    let query = supabase
      .from("receipts")
      .select("category, total")
      .eq("org_id", currentOrg.id);

    if (fromDate) query = query.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) query = query.lte("receipt_date", format(toDate, "yyyy-MM-dd"));

    const { data } = await query;

    const categoryMap = new Map<string, number>();
    data?.forEach((r: any) => {
      const cat = r.category || "Uncategorized";
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + r.total);
    });

    const chartData = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10

    setCategoryData(chartData);
  };

  const fetchTransactions = async () => {
    if (!currentOrg) return;

    let query = supabase
      .from("transactions")
      .select("id, txn_date, description, amount, category, source_account_name, direction")
      .eq("org_id", currentOrg.id)
      .order("txn_date", { ascending: false })
      .limit(50);

    if (fromDate) query = query.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) query = query.lte("txn_date", format(toDate, "yyyy-MM-dd"));

    const { data: txnData } = await query;

    // Get matches for these transactions
    const { data: matchesData } = await supabase
      .from("matches")
      .select("transaction_id")
      .eq("org_id", currentOrg.id);

    const matchedTxnIds = new Set(matchesData?.map(m => m.transaction_id) || []);

    const enrichedData = txnData?.map((txn: any) => ({
      ...txn,
      isMatched: matchedTxnIds.has(txn.id),
    })) || [];

    setTransactions(enrichedData);
  };

  const fetchMatchedPairs = async () => {
    if (!currentOrg) return;

    const { data: matchesData } = await supabase
      .from("matches")
      .select(`
        id,
        created_at,
        confidence,
        method,
        receipt_id,
        transaction_id
      `)
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!matchesData || matchesData.length === 0) {
      setMatchedPairs([]);
      return;
    }

    // Fetch receipts
    const receiptIds = matchesData.map(m => m.receipt_id);
    const { data: receiptsData } = await supabase
      .from("receipts")
      .select("id, receipt_date, vendor, total")
      .in("id", receiptIds);

    // Fetch transactions
    const txnIds = matchesData.map(m => m.transaction_id);
    let txnQuery = supabase
      .from("transactions")
      .select("id, txn_date, description, amount")
      .in("id", txnIds);

    if (fromDate) txnQuery = txnQuery.gte("txn_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) txnQuery = txnQuery.lte("txn_date", format(toDate, "yyyy-MM-dd"));

    const { data: txnData } = await txnQuery;

    const receiptsMap = new Map(receiptsData?.map(r => [r.id, r]) || []);
    const txnMap = new Map(txnData?.map(t => [t.id, t]) || []);

    const pairs = matchesData
      .filter(m => txnMap.has(m.transaction_id)) // Only include if transaction is in date range
      .map(m => {
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

    let query = supabase
      .from("receipts")
      .select("id, receipt_date, vendor, total, category, source")
      .eq("org_id", currentOrg.id)
      .order("receipt_date", { ascending: false })
      .limit(50);

    if (fromDate) query = query.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
    if (toDate) query = query.lte("receipt_date", format(toDate, "yyyy-MM-dd"));

    const { data: receiptsData } = await query;

    // Get matches
    const { data: matchesData } = await supabase
      .from("matches")
      .select("receipt_id")
      .eq("org_id", currentOrg.id);

    const matchedReceiptIds = new Set(matchesData?.map(m => m.receipt_id) || []);

    const enrichedData = receiptsData?.map((r: any) => ({
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
          <p className="text-muted-foreground">
            Accounting control center • Real-time financial overview
          </p>
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

            <DashboardTabs
              transactions={transactions}
              matchedPairs={matchedPairs}
              receipts={receipts}
            />
          </>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
