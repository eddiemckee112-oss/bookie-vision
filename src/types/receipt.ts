export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  vendor: string;
  date: string;
  total: number;
  tax?: number;
  subtotal?: number;
  items: ReceiptItem[];
  category?: string;
  paymentMethod?: string;
  rawText?: string;
}
