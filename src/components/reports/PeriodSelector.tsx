import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears } from "date-fns";
import { cn } from "@/lib/utils";

interface PeriodSelectorProps {
  fromDate: Date | undefined;
  toDate: Date | undefined;
  onFromDateChange: (date: Date | undefined) => void;
  onToDateChange: (date: Date | undefined) => void;
}

const PeriodSelector = ({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: PeriodSelectorProps) => {
  const setThisMonth = () => {
    const now = new Date();
    onFromDateChange(startOfMonth(now));
    onToDateChange(endOfMonth(now));
  };

  const setLastMonth = () => {
    const lastMonth = subMonths(new Date(), 1);
    onFromDateChange(startOfMonth(lastMonth));
    onToDateChange(endOfMonth(lastMonth));
  };

  const setThisYear = () => {
    const now = new Date();
    onFromDateChange(startOfYear(now));
    onToDateChange(endOfYear(now));
  };

  const setLastYear = () => {
    const lastYear = subYears(new Date(), 1);
    onFromDateChange(startOfYear(lastYear));
    onToDateChange(endOfYear(lastYear));
  };

  const setAllTime = () => {
    onFromDateChange(undefined);
    onToDateChange(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={setThisMonth}>
          This Month
        </Button>
        <Button variant="outline" size="sm" onClick={setLastMonth}>
          Last Month
        </Button>
        <Button variant="outline" size="sm" onClick={setThisYear}>
          This Year
        </Button>
        <Button variant="outline" size="sm" onClick={setLastYear}>
          Last Year
        </Button>
        <Button variant="outline" size="sm" onClick={setAllTime}>
          All Time
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">From:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[200px] justify-start text-left font-normal",
                  !fromDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? format(fromDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={onFromDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">To:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[200px] justify-start text-left font-normal",
                  !toDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? format(toDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={onToDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {(fromDate || toDate) && (
        <p className="text-sm text-muted-foreground">
          Showing data {fromDate ? `from ${format(fromDate, "MMM d, yyyy")}` : "from beginning"}{" "}
          {toDate ? `to ${format(toDate, "MMM d, yyyy")}` : "to present"}
        </p>
      )}
    </div>
  );
};

export default PeriodSelector;
