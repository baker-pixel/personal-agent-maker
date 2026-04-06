import { useEffect, useState, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import ModeSelect from "./pages/ModeSelect";
import DashboardPage from "./pages/DashboardPage";
import DecisionText from "./pages/DecisionText";
import DecisionVoice from "./pages/DecisionVoice";
import EmailView from "./pages/EmailView";
import CalendarView from "./pages/CalendarView";
import SettingsPage from "./pages/SettingsPage";
import GoogleCallback from "./pages/GoogleCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ session, children }: { session: Session | null; children: React.ReactNode }) => {
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const recoveryRedirected = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
        if (event === "PASSWORD_RECOVERY" && !recoveryRedirected.current) {
          recoveryRedirected.current = true;
          window.location.href = "/reset-password#type=recovery";
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={session ? <Navigate to="/mode-select" replace /> : <Landing />} />
            <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/mode-select" replace />} />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/mode-select" element={<ProtectedRoute session={session}><ModeSelect /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute session={session}><DashboardPage /></ProtectedRoute>} />
            <Route path="/decision/text" element={<ProtectedRoute session={session}><DecisionText /></ProtectedRoute>} />
            <Route path="/decision/voice" element={<ProtectedRoute session={session}><DecisionVoice /></ProtectedRoute>} />
            <Route path="/email" element={<ProtectedRoute session={session}><EmailView /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute session={session}><CalendarView /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute session={session}><SettingsPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
