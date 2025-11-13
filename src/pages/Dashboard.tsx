import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, CreditCard, Link as LinkIcon, TrendingUp } from "lucide-react";
import Layout from "@/components/Layout";

const Dashboard = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalReceipts: 0,
    totalTransactions: 0,
    matchedCount: 0,
    unmatchedReceipts: 0,
  });

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }

    const fetchStats = async () => {
      const [receipts, transactions, matches] = await Promise.all([
        supabase.from("receipts").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
        supabase.from("matches").select("id", { count: "exact", head: true }).eq("org_id", currentOrg.id),
      ]);

      setStats({
        totalReceipts: receipts.count || 0,
        totalTransactions: transactions.count || 0,
        matchedCount: matches.count || 0,
        unmatchedReceipts: (receipts.count || 0) - (matches.count || 0),
      });
    };

    fetchStats();
  }, [currentOrg, orgLoading, navigate]);

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your bookkeeping</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalReceipts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTransactions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Matched</CardTitle>
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.matchedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unmatched</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.unmatchedReceipts}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
