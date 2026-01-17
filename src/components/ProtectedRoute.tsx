import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // 1) quick check
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setIsAuthenticated(!!data.session);

      // 2) If no session yet, wait a bit because:
      // - magic link / recovery links often set session async after load
      if (!data.session) {
        await new Promise((r) => setTimeout(r, 800));
        const { data: again } = await supabase.auth.getSession();
        if (!cancelled) setIsAuthenticated(!!again.session);
      }
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setIsAuthenticated(!!session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // still checking
  if (isAuthenticated === null) return null;

  // not authed -> send to auth, but keep where they tried to go
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
