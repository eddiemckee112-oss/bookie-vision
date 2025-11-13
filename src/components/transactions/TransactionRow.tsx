import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link as LinkIcon, X, Upload } from "lucide-react";
import ReceiptThumbnail from "./ReceiptThumbnail";

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  direction: string;
  category: string | null;
  source_account_name: string | null;
}

interface LinkedReceipt {
  vendor: string;
  image_url: string | null;
  total: number;
}

interface TransactionRowProps {
  transaction: Transaction;
  isMatched: boolean;
  linkedReceipt?: LinkedReceipt;
  hasSelectedReceipt: boolean;
  onLink: (transactionId: string) => void;
  onUnlink: (transactionId: string) => void;
  onUploadReceipt: () => void;
}

const TransactionRow = ({
  transaction,
  isMatched,
  linkedReceipt,
  hasSelectedReceipt,
  onLink,
  onUnlink,
  onUploadReceipt,
}: TransactionRowProps) => {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {new Date(transaction.txn_date).toLocaleDateString()}
      </TableCell>
      <TableCell>{transaction.description}</TableCell>
      <TableCell className="text-right font-medium">
        ${transaction.amount.toFixed(2)}
      </TableCell>
      <TableCell>
        <Badge variant={transaction.direction === "debit" ? "secondary" : "default"}>
          {transaction.direction}
        </Badge>
      </TableCell>
      <TableCell>{transaction.category || "-"}</TableCell>
      <TableCell>{transaction.source_account_name || "-"}</TableCell>
      <TableCell>
        {linkedReceipt ? (
          <ReceiptThumbnail
            vendor={linkedReceipt.vendor}
            imageUrl={linkedReceipt.image_url}
            total={linkedReceipt.total}
          />
        ) : (
          <span className="text-sm text-muted-foreground">No receipt</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={isMatched ? "default" : "secondary"}>
          {isMatched ? "Matched" : "Unmatched"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {hasSelectedReceipt ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => onLink(transaction.id)}
              className="whitespace-nowrap"
            >
              <LinkIcon className="h-4 w-4 mr-1" />
              Link to this
            </Button>
          ) : isMatched ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUnlink(transaction.id)}
              className="whitespace-nowrap"
            >
              <X className="h-4 w-4 mr-1" />
              Unlink
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadReceipt}
              className="whitespace-nowrap"
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload Receipt
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

export default TransactionRow;
