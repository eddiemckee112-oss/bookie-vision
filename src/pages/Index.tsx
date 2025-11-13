import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Receipt, Sparkles } from "lucide-react";
import ReceiptUploader from "@/components/receipt/ReceiptUploader";
import ReceiptResults from "@/components/receipt/ReceiptResults";
import ProcessingState from "@/components/receipt/ProcessingState";
import { ReceiptData } from "@/types/receipt";

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const handleProcessingComplete = (data: ReceiptData) => {
    setReceiptData(data);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-white shadow-primary">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI Receipt Scanner</h1>
              <p className="text-sm text-muted-foreground">
                Extract data from receipts instantly
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Upload */}
          <div className="animate-fade-in">
            <Card className="p-6 shadow-md border-border">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">
                  Upload Receipt
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Upload a receipt image or PDF, and our AI will extract all the important
                information for your bookkeeping system.
              </p>
              <ReceiptUploader
                onProcessingStart={() => setIsProcessing(true)}
                onProcessingComplete={handleProcessingComplete}
              />
            </Card>
          </div>

          {/* Right Column - Results */}
          <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            {isProcessing ? (
              <ProcessingState />
            ) : receiptData ? (
              <ReceiptResults data={receiptData} />
            ) : (
              <Card className="p-6 shadow-md border-border h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Receipt className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-sm">
                    Upload a receipt to see extracted data here
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
