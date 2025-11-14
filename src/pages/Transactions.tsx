import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import CSVUploader from "@/components/transactions/CSVUploader";
import TransactionFilters from "@/components/transactions/TransactionFilters";
import TransactionSummary from "@/components/transactions/TransactionSummary";
import TransactionRow from "@/components/transactions/TransactionRow";
import BankSyncSection from "@/components/transactions/BankSyncSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  vendor_clean: string | null;
  amount: number;
  direction: string;
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

const Transactions = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [linkedReceipts, setLinkedReceipts] = useState<Record<string, LinkedReceipt>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    
    // Check for selected receipt from Receipts page
    const linkReceiptId = sessionStorage.getItem("linkReceipt");
    if (linkReceiptId) {
      setSelectedReceiptId(linkReceiptId);
    }
    
    fetchTransactions();
    fetchMatches();
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

    setTransactions(data || []);
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

    setMatches(matchesData || []);

    // Fetch receipt details for matched transactions
    const receiptIds = matchesData?.map(m => m.receipt_id) || [];
    if (receiptIds.length > 0) {
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("receipts")
        .select("id, vendor, image_url, total")
        .in("id", receiptIds);

      if (!receiptsError && receiptsData) {
        const receiptsMap: Record<string, LinkedReceipt> = {};
        receiptsData.forEach(receipt => {
          receiptsMap[receipt.id] = receipt;
        });
        setLinkedReceipts(receiptsMap);
      }
    }
  };

  const handleLinkReceipt = async (transactionId: string) => {
    if (!selectedReceiptId || !currentOrg) return;

    try {
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;

      const { error } = await supabase.from("matches").insert({
        org_id: currentOrg.id,
        transaction_id: transactionId,
        receipt_id: selectedReceiptId,
        matched_amount: transaction.amount,
        confidence: 1.0,
        method: "manual",
        match_type: "manual",
      });

      if (error) throw error;

      toast({ title: "Receipt linked successfully" });
      
      // Clear selection and refresh
      sessionStorage.removeItem("linkReceipt");
      setSelectedReceiptId(null);
      fetchMatches();
    } catch (error: any) {
      toast({
        title: "Failed to link receipt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUnlinkReceipt = async (transactionId: string) => {
    if (!currentOrg) return;

    try {
      const { error } = await supabase
        .from("matches")
        .delete()
        .eq("transaction_id", transactionId)
        .eq("org_id", currentOrg.id);

      if (error) throw error;

      toast({ title: "Receipt unlinked" });
      fetchMatches();
    } catch (error: any) {
      toast({
        title: "Failed to unlink receipt",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUploadReceipt = () => {
    navigate("/receipts");
  };

  const handleApplyRules = async () => {
    if (!currentOrg) return;
    
    setIsApplyingRules(true);
    try {
      // Fetch vendor_rules and rules
      const { data: vendorRules, error: vendorRulesError } = await supabase
        .from("vendor_rules")
        .select("*")
        .eq("org_id", currentOrg.id);

      const { data: rules, error: rulesError } = await supabase
        .from("rules")
        .select("*")
        .eq("org_id", currentOrg.id)
        .eq("enabled", true);

      if (vendorRulesError) throw vendorRulesError;
      if (rulesError) throw rulesError;

      // Get uncategorized transactions
      const uncategorizedTxns = transactions.filter(t => !t.category);
      let updatedCount = 0;

      for (const txn of uncategorizedTxns) {
        let matchedRule = null;

        // Try to match with vendor_rules first
        if (vendorRules) {
          for (const rule of vendorRules) {
            const pattern = new RegExp(rule.vendor_pattern, "i");
            const matchesVendor = txn.description.match(pattern) || txn.vendor_clean?.match(pattern);
            const matchesDirection = !rule.direction_filter || rule.direction_filter === txn.direction;

            if (matchesVendor && matchesDirection) {
              matchedRule = {
                category: rule.category,
                source: rule.source || "vendor_rule",
              };
              break;
            }
          }
        }

        // Try to match with rules if no vendor_rule matched
        if (!matchedRule && rules) {
          for (const rule of rules) {
            const pattern = new RegExp(rule.match_pattern, "i");
            if (txn.description.match(pattern) || txn.vendor_clean?.match(pattern)) {
              matchedRule = {
                category: rule.default_category,
                source: "rule",
              };
              break;
            }
          }
        }

        // Update transaction if a rule matched
        if (matchedRule) {
          const { error } = await supabase
            .from("transactions")
            .update({
              category: matchedRule.category,
              source: matchedRule.source,
            })
            .eq("id", txn.id);

          if (!error) updatedCount++;
        }
      }

      toast({
        title: "Rules applied successfully",
        description: `Updated ${updatedCount} transaction${updatedCount !== 1 ? "s" : ""}`,
      });

      fetchTransactions();
    } catch (error: any) {
      toast({
        title: "Error applying rules",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsApplyingRules(false);
    }
  };

  // Filter and search logic
  const getMatchedTransactionIds = () => {
    return new Set(matches.map(m => m.transaction_id));
  };

  const matchedTxnIds = getMatchedTransactionIds();

  const filteredTransactions = transactions.filter((txn) => {
    // Search filter
    const matchesSearch = 
      txn.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.vendor_clean?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    const isMatched = matchedTxnIds.has(txn.id);
    if (filterStatus === "matched" && !isMatched) return false;
    if (filterStatus === "unmatched" && isMatched) return false;
    if (filterStatus === "recent") {
      // Show most recent first (already sorted by txn_date desc)
      return true;
    }

    return true;
  });

  const matchedCount = transactions.filter(t => matchedTxnIds.has(t.id)).length;
  const unmatchedCount = transactions.length - matchedCount;

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            Import and manage your transactions • {transactions.length} total • {matchedCount} matched • {unmatchedCount} unmatched
          </p>
        </div>

        {selectedReceiptId && (
          <Card className="p-4 bg-primary/5 border-primary">
            <p className="text-sm font-medium">
              📎 Receipt selected! Click "Link to this" on any transaction to match it.
            </p>
          </Card>
        )}

        <BankSyncSection />

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Import Transactions</h2>
          <CSVUploader orgId={currentOrg!.id} onUploadComplete={() => { fetchTransactions(); fetchMatches(); }} />
        </Card>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Transactions</h2>
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleApplyRules}
                  disabled={isApplyingRules}
                  variant="outline"
                >
                  {isApplyingRules ? "Applying..." : "Apply Rules"}
                </Button>
                <TransactionSummary
                  totalCount={transactions.length}
                  matchedCount={matchedCount}
                  unmatchedCount={unmatchedCount}
                />
              </div>
            </div>

            <TransactionFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterStatus={filterStatus}
              onFilterChange={setFilterStatus}
            />

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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground h-32">
                        {transactions.length === 0 
                          ? "No transactions yet. Import a CSV file to get started!"
                          : "No transactions match your filters"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((transaction) => {
                      const isMatched = matchedTxnIds.has(transaction.id);
                      const match = matches.find(m => m.transaction_id === transaction.id);
                      const linkedReceipt = match ? linkedReceipts[match.receipt_id] : undefined;

                      return (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          isMatched={isMatched}
                          linkedReceipt={linkedReceipt}
                          hasSelectedReceipt={!!selectedReceiptId}
                          onLink={handleLinkReceipt}
                          onUnlink={handleUnlinkReceipt}
                          onUploadReceipt={handleUploadReceipt}
                        />
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
