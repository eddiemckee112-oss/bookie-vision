import React from "react";

type DateMode = "this_month" | "last_month" | "month" | "range" | "all";

type Props = {
  searchQuery: string;
  onSearchChange: (v: string) => void;

  filterStatus: string;
  onFilterChange: (v: string) => void;

  dateMode: DateMode;
  onDateModeChange: (v: DateMode) => void;

  monthValue: string;
  onMonthChange: (v: string) => void;

  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
};

const TransactionFilters: React.FC<Props> = ({
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
}) => {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          placeholder="Search description or vendor..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        {/* Status filter */}
        <select
          className="h-10 w-full sm:w-48 rounded-md border bg-background px-3 text-sm"
          value={filterStatus}
          onChange={(e) => onFilterChange(e.target.value)}
        >
          <option value="all">All</option>
          <option value="matched">Matched</option>
          <option value="unmatched">Unmatched</option>
          <option value="recent">Recent (30d)</option>
        </select>
      </div>

      {/* Date window */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="h-10 w-full sm:w-56 rounded-md border bg-background px-3 text-sm"
          value={dateMode}
          onChange={(e) => onDateModeChange(e.target.value as DateMode)}
        >
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="month">Pick a Month</option>
          <option value="range">Custom Range</option>
          <option value="all">All Time</option>
        </select>

        {dateMode === "month" && (
          <input
            className="h-10 w-full sm:w-56 rounded-md border bg-background px-3 text-sm"
            type="month"
            value={monthValue}
            onChange={(e) => onMonthChange(e.target.value)}
          />
        )}

        {dateMode === "range" && (
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionFilters;
