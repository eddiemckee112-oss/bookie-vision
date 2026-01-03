import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

export type OrgCategory = {
  id: string;
  org_id: string;
  name: string;
  sort: number;
  is_active: boolean;
};

type Options = {
  includeInactive?: boolean;
};

export function useOrgCategories(options: Options = {}) {
  const { includeInactive = false } = options;

  const { currentOrg } = useOrg();
  const [categories, setCategories] = useState<OrgCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    if (!currentOrg) return;

    setLoading(true);

    let query = supabase
      .from("org_categories")
      .select("id, org_id, name, sort, is_active")
      .eq("org_id", currentOrg.id);

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query
      .order("sort", { ascending: true })
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      console.error("Failed to fetch org_categories:", error);
      setCategories([]);
      return;
    }

    // guard: remove empty names (Radix Select will crash on empty)
    const cleaned = (data ?? []).filter((c) => (c.name ?? "").trim().length > 0);

    setCategories(cleaned);
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, includeInactive]);

  // Always ensure Uncategorized exists and sits at the top for dropdowns
  const categoriesForSelect = useMemo(() => {
    const hasUncat = categories.some(
      (c) => c.name.trim().toLowerCase() === "uncategorized"
    );

    const uncat: OrgCategory = {
      id: "uncategorized",
      org_id: currentOrg?.id ?? "",
      name: "Uncategorized",
      sort: 0,
      is_active: true,
    };

    const list = hasUncat ? categories : [uncat, ...categories];

    // Final guard: unique by name (prevents duplicates like "Food & Supplies" twice)
    const seen = new Set<string>();
    return list.filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categories, currentOrg?.id]);

  return { categories: categoriesForSelect, loading, refresh: fetchCategories };
}
