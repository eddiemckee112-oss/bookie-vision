import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";

interface DateRangeControlsProps {
  fromDate: Date | undefined;
  toDate: Date | undefined;
  onFromDateChange: (date: Date | undefined) => void;
  onToDateChange: (date: Date | undefined) => void;
}

const DateRangeControls = ({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: DateRangeControlsProps) => {
  const setLast7Days = () => {
    const now = new Date();
    onFromDateChange(subDays(now, 7));
    onToDateChange(now);
  };

  const setLast30Days = () => {
    const now = new Date();
    onFromDateChange(subDays(now, 30));
    onToDateChange(now);
  };

  const setYearToDate = () => {
    const now = new Date();
    onFromDateChange(startOfYear(now));
    onToDateChange(now);
  };

  const setAllTime = () => {
    onFromDateChange(undefined);
    onToDateChange(undefined);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={setLast7Days}>
          Last 7 days
        </Button>
        <Button variant="outline" size="sm" onClick={setLast30Days}>
          Last 30 days
        </Button>
        <Button variant="outline" size="sm" onClick={setYearToDate}>
          Year to date
        </Button>
        <Button variant="outline" size="sm" onClick={setAllTime}>
          All time
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">From:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[160px] justify-start text-left font-normal",
                  !fromDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? format(fromDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={fromDate} onSelect={onFromDateChange} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">To:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[160px] justify-start text-left font-normal",
                  !toDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? format(toDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={toDate} onSelect={onToDateChange} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default DateRangeControls;
