import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";

export type OrgCategory = {
  id: string;
  org_id: string;
  name: string;
  sort: number;
  is_active: boolean;
};

export function useOrgCategories() {
  const { currentOrg } = useOrg();
  const [categories, setCategories] = useState<OrgCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    if (!currentOrg) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("org_categories")
      .select("id, org_id, name, sort, is_active")
      .eq("org_id", currentOrg.id)
      .eq("is_active", true)
      .order("sort", { ascending: true })
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      console.error("Failed to fetch org_categories:", error);
      return;
    }

    setCategories(data ?? []);
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  return { categories, loading, refresh: fetchCategories };
}
