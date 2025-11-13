import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OrgProvider } from "./contexts/OrgContext";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboard from "./pages/Onboard";
import ChooseOrg from "./pages/ChooseOrg";
import Dashboard from "./pages/Dashboard";
import Receipts from "./pages/Receipts";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Square from "./pages/Square";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OrgProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboard" element={<Onboard />} />
            <Route path="/choose-org" element={<ChooseOrg />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/square" element={<Square />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
