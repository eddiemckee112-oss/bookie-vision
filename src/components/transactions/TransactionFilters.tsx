import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TransactionFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;

  filterStatus: string;
  onFilterChange: (value: string) => void;

  dateMode: "this_month" | "last_month" | "month" | "range" | "all";
  onDateModeChange: (value: TransactionFiltersProps["dateMode"]) => void;

  monthValue: string; // YYYY-MM
  onMonthChange: (value: string) => void;

  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

const TransactionFilters = ({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  dateMode,
  onDateModeChange,
  monthValue,
  onMonthChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: TransactionFiltersProps) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search description or vendor..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1"
        />

        <Select value={filterStatus} onValueChange={onFilterChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="recent">Recently Added</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <Select value={dateMode} onValueChange={(v) => onDateModeChange(v as any)}>
          <SelectTrigger className="w-full lg:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="month">Pick a Month</SelectItem>
            <SelectItem value="range">Custom Range</SelectItem>
            <SelectItem value="all">All Dates</SelectItem>
          </SelectContent>
        </Select>

        {dateMode === "month" && (
          <Input
            type="month"
            value={monthValue}
            onChange={(e) => onMonthChange(e.target.value)}
            className="w-full lg:w-56"
          />
        )}

        {dateMode === "range" && (
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full sm:w-56"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full sm:w-56"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionFilters;
