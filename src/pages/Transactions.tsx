import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  category: string | null;
}

const Transactions = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchTransactions();
  }, [currentOrg, orgLoading, navigate]);

  const fetchTransactions = async () => {
    if (!currentOrg) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("txn_date", { ascending: false })
      .limit(100);

    if (error) {
      toast({
        title: "Error fetching transactions",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setTransactions((data || []) as Transaction[]);
  };

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">View and manage your bank transactions</p>
        </div>

        <Card className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>{new Date(txn.txn_date).toLocaleDateString()}</TableCell>
                    <TableCell>{txn.description}</TableCell>
                    <TableCell>{txn.category || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={txn.direction === "debit" ? "destructive" : "default"}>
                        {txn.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ${txn.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
