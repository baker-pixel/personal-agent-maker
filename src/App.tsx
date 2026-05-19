import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IntegrationsProvider } from "@/contexts/IntegrationsContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { getPasswordRecoveryParams, hasStoredPasswordRecovery } from "@/lib/passwordRecovery";
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
import Office from "./pages/Office";
const Office3D = lazy(() => import("./pages/Office3D"));
import EodWrapup from "./pages/EodWrapup";
import SmsLog from "./pages/SmsLog";
import Steno from "./pages/Steno";
import StenoHistory from "./pages/StenoHistory";
import Contacts from "./pages/Contacts";
import Files from "./pages/Files";
import Leads from "./pages/Leads";
import Tasks from "./pages/Tasks";
import AppHeader from "./components/AppHeader";
import InstallBanner from "./components/InstallBanner";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import Investors from "./pages/Investors";
import InvestorContact from "./pages/InvestorContact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

const queryClient = new QueryClient();

const ProtectedRoute = ({ session, children }: { session: Session | null; children: React.ReactNode }) => {
  if (!session) return <Navigate to="/auth" replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(() => getPasswordRecoveryParams().hasRecoveryIntent || hasStoredPasswordRecovery());
  const recoveryRedirected = useRef(false);

  useEffect(() => {
    const recoveryUrl = getPasswordRecoveryParams().hasRecoveryIntent || hasStoredPasswordRecovery();
    if (recoveryUrl) setIsRecovery(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
        if (event === "PASSWORD_RECOVERY" && !recoveryRedirected.current) {
          recoveryRedirected.current = true;
          setIsRecovery(true);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (recoveryUrl) setIsRecovery(true);
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
        <IntegrationsProvider>
          <AgentProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={isRecovery ? <Navigate to="/reset-password" replace /> : session ? <Navigate to="/mode-select" replace /> : <Landing />} />
              <Route path="/auth" element={!session ? <Auth /> : isRecovery ? <Navigate to="/reset-password" replace /> : <Navigate to="/mode-select" replace />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/investors" element={<Investors />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/mode-select" element={<ProtectedRoute session={session}><ModeSelect /></ProtectedRoute>} />
              <Route path="/office" element={<ProtectedRoute session={session}><Office /></ProtectedRoute>} />
              <Route path="/office-3d" element={<ProtectedRoute session={session}><Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>}><Office3D /></Suspense></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute session={session}><DashboardPage /></ProtectedRoute>} />
              <Route path="/decision/text" element={<ProtectedRoute session={session}><DecisionText /></ProtectedRoute>} />
              <Route path="/decision/voice" element={<ProtectedRoute session={session}><DecisionVoice /></ProtectedRoute>} />
              <Route path="/email" element={<ProtectedRoute session={session}><EmailView /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute session={session}><CalendarView /></ProtectedRoute>} />
              <Route path="/eod-wrapup" element={<ProtectedRoute session={session}><EodWrapup /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute session={session}><SettingsPage /></ProtectedRoute>} />
              <Route path="/sms-log" element={<ProtectedRoute session={session}><SmsLog /></ProtectedRoute>} />
              <Route path="/steno" element={<ProtectedRoute session={session}><Steno /></ProtectedRoute>} />
              <Route path="/steno/history" element={<ProtectedRoute session={session}><StenoHistory /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute session={session}><Contacts /></ProtectedRoute>} />
              <Route path="/files" element={<ProtectedRoute session={session}><Files /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute session={session}><Leads /></ProtectedRoute>} />
              <Route path="/tasks" element={<ProtectedRoute session={session}><Tasks /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            {session && <InstallBanner />}
          </BrowserRouter>
          </AgentProvider>
        </IntegrationsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
