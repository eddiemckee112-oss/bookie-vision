import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

interface Org {
  id: string;
  name: string;
  created_at: string;
}

interface OrgUser {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
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
      console.error("Error fetching orgs:", error);
      return [];
    }

    return orgUsers || [];
  };

  const refreshOrgs = async () => {
    if (!user) return;
    const orgData = await fetchOrgs(user.id);
    const orgsArray = orgData.map((ou: any) => ou.orgs).filter(Boolean);
    setOrgs(orgsArray);

    // Set current org if not set
    if (!currentOrg && orgsArray.length > 0) {
      const storedOrgId = localStorage.getItem("currentOrgId");
      const orgToSet = storedOrgId
        ? orgsArray.find((o: Org) => o.id === storedOrgId) || orgsArray[0]
        : orgsArray[0];
      setCurrentOrg(orgToSet);
      
      // Get role for this org
      const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
      setOrgRole(orgUser?.role || null);
    }
  };

  const switchOrg = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      localStorage.setItem("currentOrgId", orgId);
      
      // Update role
      supabase
        .from("org_users")
        .select("role")
        .eq("user_id", user?.id)
        .eq("org_id", orgId)
        .single()
        .then(({ data }) => setOrgRole(data?.role || null));
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchOrgs(session.user.id).then((orgData) => {
          const orgsArray = orgData.map((ou: any) => ou.orgs).filter(Boolean);
          setOrgs(orgsArray);

          if (orgsArray.length > 0) {
            const storedOrgId = localStorage.getItem("currentOrgId");
            const orgToSet = storedOrgId
              ? orgsArray.find((o: Org) => o.id === storedOrgId) || orgsArray[0]
              : orgsArray[0];
            setCurrentOrg(orgToSet);
            
            const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
            setOrgRole(orgUser?.role || null);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchOrgs(session.user.id).then((orgData) => {
            const orgsArray = orgData.map((ou: any) => ou.orgs).filter(Boolean);
            setOrgs(orgsArray);
            
            if (orgsArray.length > 0 && !currentOrg) {
              const storedOrgId = localStorage.getItem("currentOrgId");
              const orgToSet = storedOrgId
                ? orgsArray.find((o: Org) => o.id === storedOrgId) || orgsArray[0]
                : orgsArray[0];
              setCurrentOrg(orgToSet);
              
              const orgUser = orgData.find((ou: any) => ou.org_id === orgToSet.id);
              setOrgRole(orgUser?.role || null);
            }
            setLoading(false);
          });
        }, 0);
      } else {
        setCurrentOrg(null);
        setOrgRole(null);
        setOrgs([]);
        setLoading(false);
      }
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
