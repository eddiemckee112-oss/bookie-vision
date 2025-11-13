import { Badge } from "@/components/ui/badge";

interface TransactionSummaryProps {
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

const TransactionSummary = ({
  totalCount,
  matchedCount,
  unmatchedCount,
}: TransactionSummaryProps) => {
  return (
    <div className="flex flex-wrap gap-3">
      <Badge variant="outline" className="text-sm px-4 py-2">
        Total: <span className="font-bold ml-1">{totalCount}</span>
      </Badge>
      <Badge variant="default" className="text-sm px-4 py-2">
        Matched: <span className="font-bold ml-1">{matchedCount}</span>
      </Badge>
      <Badge variant="secondary" className="text-sm px-4 py-2">
        Unmatched: <span className="font-bold ml-1">{unmatchedCount}</span>
      </Badge>
    </div>
  );
};

export default TransactionSummary;
