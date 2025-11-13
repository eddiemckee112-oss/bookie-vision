import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SquareSummaryProps {
  orgId: string;
}

interface SummaryData {
  totalDeposits: number;
  totalFees: number;
  loanBalance: number;
  loanRepayments: number;
  transactionCount: number;
}

const SquareSummary = ({ orgId }: SquareSummaryProps) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData>({
    totalDeposits: 0,
    totalFees: 0,
    loanBalance: 0,
    loanRepayments: 0,
    transactionCount: 0,
  });

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        // Fetch Square sales (income)
        const { data: sales } = await supabase
          .from("transactions")
          .select("amount")
          .eq("org_id", orgId)
          .eq("institution", "Square")
          .eq("category", "Income");

        // Fetch Square deposits (transfers to bank)
        const { data: deposits } = await supabase
          .from("transactions")
          .select("amount")
          .eq("org_id", orgId)
          .eq("institution", "Square")
          .eq("category", "Transfer");

        // Fetch Square fees
        const { data: fees } = await supabase
          .from("transactions")
          .select("amount")
          .eq("org_id", orgId)
          .eq("institution", "Square")
          .eq("category", "Bank Fees");

        // Fetch loan data
        const { data: loans } = await supabase
          .from("square_loans")
          .select("outstanding_balance, total_repayments")
          .eq("org_id", orgId);

        // Count total Square transactions
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .or("institution.eq.Square,institution.eq.Square Capital");

        const totalSales = sales?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const totalDeposits = Math.abs(deposits?.reduce((sum, t) => sum + Number(t.amount), 0) || 0);
        const totalFees = Math.abs(fees?.reduce((sum, t) => sum + Number(t.amount), 0) || 0);
        const loanBalance = loans?.reduce((sum, l) => sum + Number(l.outstanding_balance), 0) || 0;
        const loanRepayments = loans?.reduce((sum, l) => sum + Number(l.total_repayments), 0) || 0;

        setSummary({
          totalDeposits,
          totalFees,
          loanBalance,
          loanRepayments,
          transactionCount: count || 0,
        });
      } catch (error) {
        console.error("Error fetching Square summary:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [orgId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Bank Deposits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${summary.totalDeposits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Transferred to bank
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Processing Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${summary.totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Square card fees
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Loan Outstanding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${summary.loanBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Repaid: ${summary.loanRepayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {summary.transactionCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Square records imported
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SquareSummary;
