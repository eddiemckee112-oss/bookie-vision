import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

interface Org {
  id: string;
  name: string;
  created_at: string;
}

interface OrgContextType {
  currentOrg: Org | null;
  orgRole: "owner" | "admin" | "staff" | null;
  orgs: Org[];
  user: User | null;
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export const OrgProvider = ({ children }: { children: ReactNode }) => {
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [orgRole, setOrgRole] = useState<"owner" | "admin" | "staff" | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = async (userId: string) => {
    const { data: orgUsers, error } = await supabase
      .from("org_users")
      .select("org_id, role, orgs(id, name, created_at)")
      .eq("user_id", userId);

    if (error) {
      if (import.meta.env.DEV) console.error("Error fetching orgs:", error);
      return [];
    }

    return orgUsers || [];
  };

  // Pick the "best" org when multiple exist.
  // We pick the org with the most transactions, because that’s where your data actually is.
  const pickBestOrgId = async (orgIds: string[]) => {
    const counts = await Promise.all(
      orgIds.map(async (id) => {
        const { count, error } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("org_id", id);

        if (error) {
          if (import.meta.env.DEV) console.warn("Count tx error for org", id, error);
          return { id, count: 0 };
        }

        return { id, count: count ?? 0 };
      })
    );

    counts.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    return counts[0]?.id ?? orgIds[0];
  };

  const resolveOrgToUse = async (orgsArray: Org[]) => {
    if (orgsArray.length === 0) return null;

    const storedOrgId = localStorage.getItem("currentOrgId");
    const storedIsValid = storedOrgId && orgsArray.some((o) => o.id === storedOrgId);

    if (storedIsValid) return orgsArray.find((o) => o.id === storedOrgId) || orgsArray[0];

    const bestOrgId = await pickBestOrgId(orgsArray.map((o) => o.id));
    return orgsArray.find((o) => o.id === bestOrgId) || orgsArray[0];
  };

  const refreshOrgs = async () => {
    if (!user) return;

    const orgData = await fetchOrgs(user.id);
    const orgsArray: Org[] = orgData.map((ou: any) => ou.orgs).filter(Boolean);
    setOrgs(orgsArray);

    // Always resolve org deterministically (especially important when you belong to multiple orgs)
    const orgToSet = await resolveOrgToUse(orgsArray);

    if (orgToSet) {
      setCurrentOrg(orgToSet);
      localStorage.setItem("currentOrgId", orgToSet.id);

      const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
      setOrgRole(orgUser?.role || null);
    } else {
      setCurrentOrg(null);
      setOrgRole(null);
    }
  };

  const switchOrg = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return;

    setCurrentOrg(org);
    localStorage.setItem("currentOrgId", orgId);

    supabase
      .from("org_users")
      .select("role")
      .eq("user_id", user?.id)
      .eq("org_id", orgId)
      .single()
      .then(({ data }) => setOrgRole((data?.role as any) || null));
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);

      if (!u) {
        setLoading(false);
        return;
      }

      const orgData = await fetchOrgs(u.id);
      const orgsArray: Org[] = orgData.map((ou: any) => ou.orgs).filter(Boolean);
      setOrgs(orgsArray);

      const orgToSet = await resolveOrgToUse(orgsArray);
      if (orgToSet) {
        setCurrentOrg(orgToSet);
        localStorage.setItem("currentOrgId", orgToSet.id);

        const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
        setOrgRole(orgUser?.role || null);
      }

      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (!u) {
        setCurrentOrg(null);
        setOrgRole(null);
        setOrgs([]);
        setLoading(false);
        return;
      }

      // Re-fetch orgs after login
      setTimeout(async () => {
        const orgData = await fetchOrgs(u.id);
        const orgsArray: Org[] = orgData.map((ou: any) => ou.orgs).filter(Boolean);
        setOrgs(orgsArray);

        const orgToSet = await resolveOrgToUse(orgsArray);
        if (orgToSet) {
          setCurrentOrg(orgToSet);
          localStorage.setItem("currentOrgId", orgToSet.id);

          const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
          setOrgRole(orgUser?.role || null);
        }

        setLoading(false);
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <OrgContext.Provider value={{ currentOrg, orgRole, orgs, user, loading, switchOrg, refreshOrgs }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return context;
};
