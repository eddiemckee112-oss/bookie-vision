import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BankSyncSection = () => {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Bank Account Sync
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your bank accounts for automatic transaction imports
            </p>
          </div>
          <Button disabled variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Connect Bank
          </Button>
        </div>

        <Alert>
          <AlertDescription>
            Bank sync via Plaid/Flinks is coming soon. Transactions will be automatically imported
            and matched with your receipts. For now, use CSV upload to import transactions.
          </AlertDescription>
        </Alert>
      </div>
    </Card>
  );
};

export default BankSyncSection;
