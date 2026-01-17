// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

// Your Supabase project
const supabaseUrl = "https://advihqhjjlxumgdlbwui.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkdmlocWhqamx4dW1nZGxid3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwMTg0MzIsImV4cCI6MjA3NjU5NDQzMn0.kVlaPQg2_o9DGJYv22Dgca7veok4drF6kgLPy2wPBeY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Fixes HashRouter + password reset + magic link issues
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
