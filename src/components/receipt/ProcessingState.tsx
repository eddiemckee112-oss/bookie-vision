import { Card } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";

const ProcessingState = () => {
  return (
    <Card className="p-8 shadow-md border-border">
      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <Sparkles className="h-6 w-6 text-accent absolute -top-1 -right-1 animate-pulse" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Processing Receipt
          </h3>
          <p className="text-sm text-muted-foreground">
            Our AI is extracting data from your receipt...
          </p>
        </div>
        <div className="flex justify-center gap-1 mt-4">
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
          <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
        </div>
      </div>
    </Card>
  );
};

export default ProcessingState;
