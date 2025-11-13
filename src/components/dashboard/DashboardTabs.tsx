import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  category: string | null;
  source_account_name: string | null;
  direction: string;
  isMatched: boolean;
}

interface MatchedPair {
  id: string;
  created_at: string;
  receipt_date: string;
  receipt_vendor: string;
  receipt_total: number;
  txn_date: string;
  txn_description: string;
  txn_amount: number;
  confidence: number | null;
  method: string;
}

interface Receipt {
  id: string;
  receipt_date: string | null;
  vendor: string | null;
  total: number;
  category: string | null;
  source: string | null;
  isMatched: boolean;
}

interface DashboardTabsProps {
  transactions: Transaction[];
  matchedPairs: MatchedPair[];
  receipts: Receipt[];
}

const DashboardTabs = ({ transactions, matchedPairs, receipts }: DashboardTabsProps) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount);
  };

  return (
    <Card className="p-6">
      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="transactions">
            Transactions ({transactions.length})
          </TabsTrigger>
          <TabsTrigger value="matched">
            Matched ({matchedPairs.length})
          </TabsTrigger>
          <TabsTrigger value="receipts">
            Receipts ({receipts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          <div className="max-h-[500px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                      No transactions in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(txn.txn_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{txn.description}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell>{txn.category || "-"}</TableCell>
                      <TableCell>{txn.source_account_name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={txn.isMatched ? "default" : "secondary"}>
                          {txn.isMatched ? "Matched" : "Unmatched"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="matched" className="mt-4">
          <div className="max-h-[500px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt Vendor</TableHead>
                  <TableHead className="text-right">Receipt Total</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead className="text-right">Txn Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedPairs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                      No matched pairs in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  matchedPairs.map((pair) => (
                    <TableRow key={pair.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(pair.receipt_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{pair.receipt_vendor}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(pair.receipt_total)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {pair.txn_description}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(pair.txn_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pair.method === "auto" ? "default" : "outline"}>
                          {pair.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {pair.confidence ? `${(pair.confidence * 100).toFixed(0)}%` : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <div className="max-h-[500px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                      No receipts in this period
                    </TableCell>
                  </TableRow>
                ) : (
                  receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="whitespace-nowrap">
                        {receipt.receipt_date
                          ? format(new Date(receipt.receipt_date), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>{receipt.vendor || "-"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(receipt.total)}
                      </TableCell>
                      <TableCell>{receipt.category || "-"}</TableCell>
                      <TableCell>{receipt.source || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={receipt.isMatched ? "default" : "secondary"}>
                          {receipt.isMatched ? "Matched" : "Unmatched"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default DashboardTabs;
