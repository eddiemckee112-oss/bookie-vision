import { useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";
import SquarePaymentsUpload from "@/components/square/SquarePaymentsUpload";
import SquareDepositsUpload from "@/components/square/SquareDepositsUpload";
import SquareLoanUpload from "@/components/square/SquareLoanUpload";
import SquareSummary from "@/components/square/SquareSummary";
import SquareAccountMapper from "@/components/square/SquareAccountMapper";

const Square = () => {
  const { currentOrg } = useOrg();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (!currentOrg) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Please select an organization</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Square Integration</h1>
          <p className="text-muted-foreground mt-2">
            Import Square payments, deposits, and loan data from CSV exports
          </p>
        </div>

        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Export your Square data from the Square Dashboard (Reports → Payments, Deposits, or Capital).
            The system will automatically map Square transactions to your bookkeeping ledger and prevent duplicate entries.
          </AlertDescription>
        </Alert>

        <SquareSummary key={refreshKey} orgId={currentOrg.id} />

        <SquareAccountMapper orgId={currentOrg.id} />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Payments / Transactions</CardTitle>
              <CardDescription>
                Import Square payments report showing sales, refunds, fees, and tips
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SquarePaymentsUpload orgId={currentOrg.id} onComplete={handleUploadComplete} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deposits / Payouts</CardTitle>
              <CardDescription>
                Import Square deposits report showing money transferred to your bank
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SquareDepositsUpload orgId={currentOrg.id} onComplete={handleUploadComplete} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Square Loan / Capital</CardTitle>
              <CardDescription>
                Import Square loan data to track principal, fees, and repayments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SquareLoanUpload orgId={currentOrg.id} onComplete={handleUploadComplete} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Square;
