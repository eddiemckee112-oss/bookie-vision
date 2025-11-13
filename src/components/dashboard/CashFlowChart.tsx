import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

interface CashFlowData {
  date: string;
  debits: number;
  credits: number;
  net: number;
}

interface CashFlowChartProps {
  data: CashFlowData[];
}

const CashFlowChart = ({ data }: CashFlowChartProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Over Time</CardTitle>
        <CardDescription>
          Daily transaction flow • Debits (expenses) and Credits (income)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No transaction data in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => format(new Date(value), "MMM d")}
                className="text-xs"
              />
              <YAxis tickFormatter={formatCurrency} className="text-xs" />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="debits"
                stroke="hsl(var(--destructive))"
                name="Debits (Expenses)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="credits"
                stroke="hsl(var(--accent))"
                name="Credits (Income)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="net"
                stroke="hsl(var(--primary))"
                name="Net"
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default CashFlowChart;
