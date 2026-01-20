import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

type Role = "owner" | "admin" | "staff" | null;

const STAFF_ALLOWED_PATHS = new Set(["/receipts", "/settings"]);

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Quick check
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setIsAuthenticated(!!data.session);

      // If no session yet, give recovery/magic links time to land
      if (!data.session) {
        await new Promise((r) => setTimeout(r, 900));
        const { data: again } = await supabase.auth.getSession();
        if (!cancelled) setIsAuthenticated(!!again.session);
      }
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setIsAuthenticated(!!session);
      // reset role when auth changes (prevents stale staff/owner role after logout/login)
      if (!cancelled) setRole(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Once authenticated, load role for current org
  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      if (!isAuthenticated) return;

      setRoleLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
        return;
      }

      const orgId =
        typeof window !== "undefined" ? localStorage.getItem("currentOrgId") : null;

      if (!orgId) {
        // If they haven't selected an org yet, we don't restrict here.
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("org_users")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        if (error) {
          console.warn("ProtectedRoute role lookup error:", error.message);
          setRole(null);
        } else {
          setRole((data?.role as Role) ?? null);
        }
        setRoleLoading(false);
      }
    };

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (isAuthenticated === null) return null;

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  // Wait for role so we don't flash restricted pages
  if (roleLoading) return null;

  // Staff restriction: only receipts + settings
  if (role === "staff" && !STAFF_ALLOWED_PATHS.has(location.pathname)) {
    return <Navigate to="/receipts" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
