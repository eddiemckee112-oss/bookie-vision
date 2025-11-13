import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { DollarSign } from "lucide-react";

interface TaxSummaryProps {
  orgId: string;
  fromDate: Date | undefined;
  toDate: Date | undefined;
}

interface CategoryTax {
  category: string;
  subtotal: number;
  tax: number;
  total: number;
}

const TaxSummary = ({ orgId, fromDate, toDate }: TaxSummaryProps) => {
  const [categoryData, setCategoryData] = useState<CategoryTax[]>([]);
  const [totalSubtotal, setTotalSubtotal] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    fetchTaxSummary();
  }, [orgId, fromDate, toDate]);

  const fetchTaxSummary = async () => {
    try {
      let query = supabase
        .from("receipts")
        .select("category, subtotal, tax, total")
        .eq("org_id", orgId);

      if (fromDate) {
        query = query.gte("receipt_date", format(fromDate, "yyyy-MM-dd"));
      }
      if (toDate) {
        query = query.lte("receipt_date", format(toDate, "yyyy-MM-dd"));
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by category
      const categoryMap = new Map<string, CategoryTax>();
      let sumSubtotal = 0;
      let sumTax = 0;
      let sumTotal = 0;

      (data || []).forEach((receipt: any) => {
        const category = receipt.category || "Uncategorized";
        const subtotal = receipt.subtotal || 0;
        const tax = receipt.tax || 0;
        const total = receipt.total || 0;

        if (!categoryMap.has(category)) {
          categoryMap.set(category, { category, subtotal: 0, tax: 0, total: 0 });
        }

        const existing = categoryMap.get(category)!;
        existing.subtotal += subtotal;
        existing.tax += tax;
        existing.total += total;

        sumSubtotal += subtotal;
        sumTax += tax;
        sumTotal += total;
      });

      const sortedCategories = Array.from(categoryMap.values()).sort(
        (a, b) => b.total - a.total
      );

      setCategoryData(sortedCategories);
      setTotalSubtotal(sumSubtotal);
      setTotalTax(sumTax);
      setTotalAmount(sumTotal);
    } catch (error) {
      console.error("Error fetching tax summary:", error);
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
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          HST / Tax Summary
        </CardTitle>
        <CardDescription>
          Tax breakdown by category for the selected period
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Subtotal</div>
            <div className="text-2xl font-bold">{formatCurrency(totalSubtotal)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Tax (HST)</div>
            <div className="text-2xl font-bold text-accent">{formatCurrency(totalTax)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Amount</div>
            <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
          </div>
        </div>

        {categoryData.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Breakdown by Category</h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryData.map((cat) => (
                    <TableRow key={cat.category}>
                      <TableCell className="font-medium">{cat.category}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(cat.subtotal)}
                      </TableCell>
                      <TableCell className="text-right text-accent">
                        {formatCurrency(cat.tax)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(cat.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {categoryData.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No receipt data available for the selected period
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> This is an estimated HST summary based on receipts. 
            For accurate CRA reporting, please consult with your accountant.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TaxSummary;
