import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useOrgCategories } from "@/hooks/useOrgCategories";

type Props = {
  value: string | null | undefined;          // category name stored on transaction/rule/receipt
  onChange: (next: string) => void;          // always returns a category name
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  includeUncategorized?: boolean;
};

export default function CategorySelect({
  value,
  onChange,
  placeholder = "Select category",
  className,
  disabled,
  includeUncategorized = true,
}: Props) {
  const { categories, loading } = useOrgCategories();

  // Radix Select can't have empty string item values.
  // We'll use a safe sentinel value for "Uncategorized".
  const UNC = "__uncategorized__";

  const selectValue = value?.trim()
    ? value
    : includeUncategorized
      ? UNC
      : undefined;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === UNC) onChange("Uncategorized");
        else onChange(v);
      }}
      disabled={disabled || loading}
    >
      <SelectTrigger className={cn("w-[220px]", className)}>
        <SelectValue placeholder={loading ? "Loading..." : placeholder} />
      </SelectTrigger>

      <SelectContent>
        {includeUncategorized && (
          <SelectItem value={UNC}>Uncategorized</SelectItem>
        )}

        {categories.map((c) => (
          <SelectItem key={c.id} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
