import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Account {
  id: string;
  name: string;
  square_account_type: string | null;
}

interface SquareAccountMapperProps {
  orgId: string;
}

const SquareAccountMapper = ({ orgId }: SquareAccountMapperProps) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentsAccount, setPaymentsAccount] = useState<string>("");
  const [depositsAccount, setDepositsAccount] = useState<string>("");
  const [loanAccount, setLoanAccount] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    fetchAccounts();
  }, [orgId]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, square_account_type")
        .eq("org_id", orgId);

      if (error) throw error;

      setAccounts(data || []);

      // Set current mappings
      data?.forEach(acc => {
        if (acc.square_account_type === 'payments') setPaymentsAccount(acc.id);
        if (acc.square_account_type === 'deposits') setDepositsAccount(acc.id);
        if (acc.square_account_type === 'loan') setLoanAccount(acc.id);
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clear all existing mappings
      await supabase
        .from("accounts")
        .update({ square_account_type: null })
        .eq("org_id", orgId);

      // Set new mappings
      const updates = [];
      if (paymentsAccount) {
        updates.push(
          supabase
            .from("accounts")
            .update({ square_account_type: 'payments' })
            .eq("id", paymentsAccount)
        );
      }
      if (depositsAccount) {
        updates.push(
          supabase
            .from("accounts")
            .update({ square_account_type: 'deposits' })
            .eq("id", depositsAccount)
        );
      }
      if (loanAccount) {
        updates.push(
          supabase
            .from("accounts")
            .update({ square_account_type: 'loan' })
            .eq("id", loanAccount)
        );
      }

      await Promise.all(updates);

      toast({
        title: "Success",
        description: "Square account mappings saved",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Mapping</CardTitle>
        <CardDescription>
          Map Square transaction types to your accounting accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="payments-account">Square Payments Account</Label>
          <Select value={paymentsAccount} onValueChange={setPaymentsAccount}>
            <SelectTrigger id="payments-account">
              <SelectValue placeholder="Select account for payments" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deposits-account">Square Deposits Account</Label>
          <Select value={depositsAccount} onValueChange={setDepositsAccount}>
            <SelectTrigger id="deposits-account">
              <SelectValue placeholder="Select account for deposits" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loan-account">Square Loan Account</Label>
          <Select value={loanAccount} onValueChange={setLoanAccount}>
            <SelectTrigger id="loan-account">
              <SelectValue placeholder="Select account for loan repayments" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Mappings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SquareAccountMapper;
