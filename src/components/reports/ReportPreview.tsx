import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { format as formatDate } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface ReportPreviewProps {
  orgId: string;
  fromDate: Date | undefined;
  toDate: Date | undefined;
}

const ReportPreview = ({ orgId, fromDate, toDate }: ReportPreviewProps) => {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    fetchPreviewData();
  }, [orgId, fromDate, toDate]);

  const fetchPreviewData = async () => {
    try {
      // Fetch receipts
      let receiptsQuery = supabase
        .from("receipts")
        .select("*")
        .eq("org_id", orgId)
        .order("receipt_date", { ascending: false })
        .limit(20);

      if (fromDate) {
        receiptsQuery = receiptsQuery.gte("receipt_date", formatDate(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        receiptsQuery = receiptsQuery.lte("receipt_date", formatDate(toDate, "yyyy-MM-dd"));
      }

      const { data: receiptsData } = await receiptsQuery;
      setReceipts(receiptsData || []);

      // Fetch transactions
      let transactionsQuery = supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId)
        .order("txn_date", { ascending: false })
        .limit(20);

      if (fromDate) {
        transactionsQuery = transactionsQuery.gte("txn_date", formatDate(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        transactionsQuery = transactionsQuery.lte("txn_date", formatDate(toDate, "yyyy-MM-dd"));
      }

      const { data: transactionsData } = await transactionsQuery;
      setTransactions(transactionsData || []);

      // Fetch matches
      const { data: matchesData } = await supabase
        .from("matches")
        .select(`
          *,
          transactions!inner(txn_date),
          receipts!inner(receipt_date, vendor)
        `)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);

      setMatches(matchesData || []);
    } catch (error) {
      console.error("Error fetching preview data:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Data Preview</CardTitle>
        <CardDescription>
          Preview of the most recent 20 records (scroll to see more)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="receipts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
          </TabsList>

          <TabsContent value="receipts">
            <div className="max-h-[400px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No receipts found
                      </TableCell>
                    </TableRow>
                  ) : (
                    receipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="whitespace-nowrap">
                          {receipt.receipt_date
                            ? formatDate(new Date(receipt.receipt_date), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>{receipt.vendor || "-"}</TableCell>
                        <TableCell>{receipt.category || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(receipt.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(receipt.tax || 0)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <div className="max-h-[400px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap">
                          {txn.txn_date
                            ? formatDate(new Date(txn.txn_date), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>{txn.description}</TableCell>
                        <TableCell>
                          <Badge
                            variant={txn.direction === "debit" ? "secondary" : "default"}
                          >
                            {txn.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(txn.amount)}
                        </TableCell>
                        <TableCell>{txn.source_account_name || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="matches">
            <div className="max-h-[400px] overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No matches found
                      </TableCell>
                    </TableRow>
                  ) : (
                    matches.map((match) => (
                      <TableRow key={match.id}>
                        <TableCell className="whitespace-nowrap">
                          {match.created_at
                            ? formatDate(new Date(match.created_at), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>{match.receipts?.vendor || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={match.method === "auto" ? "default" : "outline"}>
                            {match.method}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(match.matched_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {match.confidence
                            ? `${(match.confidence * 100).toFixed(0)}%`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ReportPreview;
