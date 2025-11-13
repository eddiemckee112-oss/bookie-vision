import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, ArrowLeftRight, TrendingUp, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface KPIData {
  receiptsCount: number;
  receiptsSubtotal: number;
  receiptsTax: number;
  receiptsTotal: number;
  receiptsMatched: number;
  receiptsUnmatched: number;
  transactionsCount: number;
  transactionsDebits: number;
  transactionsCredits: number;
  transactionsMatched: number;
  transactionsUnmatched: number;
}

interface KPICardsProps {
  data: KPIData;
}

const KPICards = ({ data }: KPICardsProps) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  const receiptsMatchRate =
    data.receiptsCount > 0
      ? ((data.receiptsMatched / data.receiptsCount) * 100).toFixed(1)
      : "0";

  const transactionsMatchRate =
    data.transactionsCount > 0
      ? ((data.transactionsMatched / data.transactionsCount) * 100).toFixed(1)
      : "0";

  const matchingHealth = () => {
    const avgRate = (parseFloat(receiptsMatchRate) + parseFloat(transactionsMatchRate)) / 2;
    if (avgRate >= 80) return { label: "Good", variant: "default" as const };
    if (avgRate >= 60) return { label: "Fair", variant: "secondary" as const };
    return { label: "Needs attention", variant: "destructive" as const };
  };

  const health = matchingHealth();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Receipts</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.receiptsCount}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Total: {formatCurrency(data.receiptsTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            Tax: {formatCurrency(data.receiptsTax)}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge variant="default" className="text-xs">
              {data.receiptsMatched} matched
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {data.receiptsUnmatched} unmatched
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.transactionsCount}</div>
          <p className="text-xs text-destructive mt-1">
            Debits: {formatCurrency(data.transactionsDebits)}
          </p>
          <p className="text-xs text-accent">
            Credits: {formatCurrency(data.transactionsCredits)}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge variant="default" className="text-xs">
              {data.transactionsMatched} matched
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {data.transactionsUnmatched} unmatched
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Matching Health</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            <Badge variant={health.variant}>{health.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Receipts: {receiptsMatchRate}% matched
          </p>
          <p className="text-xs text-muted-foreground">
            Transactions: {transactionsMatchRate}% matched
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Position</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(data.transactionsCredits - data.transactionsDebits)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Credits - Debits
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Based on {data.transactionsCount} transactions
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default KPICards;
