// @ts-nocheck
import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
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
import DashboardPage from "./pages/DashboardPage";
import ModeSelect from "./pages/ModeSelect";
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
import BetaCrm from "./pages/BetaCrm";
import InboxPage from "./pages/InboxPage";
import AppHeader from "./components/AppHeader";
import InstallBanner from "./components/InstallBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdatePrompt } from "./components/UpdatePrompt";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import Investors from "./pages/Investors";
import InvestorContact from "./pages/InvestorContact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

const queryClient = new QueryClient();

const ProtectedRoute = ({
  session,
  isOnboarded,
  children,
}: {
  session: Session | null;
  isOnboarded: boolean | null;
  children: React.ReactNode;
}) => {
  if (!session) return <Navigate to="/auth" replace />;
  // Explicit false check — null means "still loading", don't redirect yet
  if (isOnboarded === false) return <Navigate to="/onboarding" replace />;
  return (
    <>
      <AppHeader />
      <ErrorBoundary variant="page">{children}</ErrorBoundary>
    </>
  );
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/auth/google/callback") return false;
    return getPasswordRecoveryParams().hasRecoveryIntent || hasStoredPasswordRecovery();
  });
  const recoveryRedirected = useRef(false);

  // null = not yet fetched; false = not onboarded; true = onboarded
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  const fetchOnboardingState = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        // DB error (network blip, etc.) — don't treat as "not onboarded".
        // Default to true if we can't confirm either way, to avoid redirect loop.
        // The worst case is a returning user sees the app; the onboarding guard
        // only matters for genuinely new accounts.
        console.warn("[App] fetchOnboardingState error:", error.message);
        setIsOnboarded(true); // fail open — don't trap users in onboarding
        return;
      }

      // No row in user_preferences → genuinely new user → needs onboarding
      setIsOnboarded(data?.onboarding_completed ?? false);
    } catch (err) {
      console.warn("[App] fetchOnboardingState threw:", err);
      setIsOnboarded(true); // fail open
    }
  }, []);

  useEffect(() => {
    const isOAuthCallback = typeof window !== "undefined" && window.location.pathname === "/auth/google/callback";
    const recoveryUrl = !isOAuthCallback && (getPasswordRecoveryParams().hasRecoveryIntent || hasStoredPasswordRecovery());
    if (recoveryUrl) setIsRecovery(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setAuthLoading(false);
        if (event === "PASSWORD_RECOVERY" && !recoveryRedirected.current) {
          recoveryRedirected.current = true;
          setIsRecovery(true);
        }
        if (event === "SIGNED_OUT") {
          setIsOnboarded(null);
        }
        if (newSession?.user && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY")) {
          fetchOnboardingState(newSession.user.id);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (recoveryUrl) setIsRecovery(true);
      setAuthLoading(false);
      if (initialSession?.user) {
        fetchOnboardingState(initialSession.user.id);
      } else {
        setIsOnboarded(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchOnboardingState]);

  // During password recovery the /reset-password page is unprotected and
  // doesn't need isOnboarded — skip that wait so no spinner flashes mid-flow.
  const loading = authLoading || (!isRecovery && session !== null && isOnboarded === null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary variant="page">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <IntegrationsProvider>
          <AgentProvider>
          <Toaster />
          <Sonner />
          <UpdatePrompt />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={isRecovery ? <Navigate to="/reset-password" replace /> : session ? <Navigate to="/mode-select" replace /> : <Landing />} />
              <Route path="/auth" element={!session ? <Auth /> : isRecovery ? <Navigate to="/reset-password" replace /> : <Navigate to="/mode-select" replace />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/investors" element={<Investors />} />
              <Route path="/investors/contact" element={<InvestorContact />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/onboarding" element={
                !session ? <Navigate to="/auth" replace /> :
                isOnboarded ? <Navigate to="/mode-select" replace /> :
                <Onboarding onComplete={() => setIsOnboarded(true)} />
              } />
              <Route path="/mode-select" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><ModeSelect /></ProtectedRoute>} />
              <Route path="/office" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Office /></ProtectedRoute>} />
              <Route path="/office-3d" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>}><Office3D /></Suspense></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><DashboardPage /></ProtectedRoute>} />
              <Route path="/decision/text" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><DecisionText /></ProtectedRoute>} />
              <Route path="/decision/voice" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><DecisionVoice /></ProtectedRoute>} />
              <Route path="/email" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><EmailView /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><CalendarView /></ProtectedRoute>} />
              <Route path="/eod-wrapup" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><EodWrapup /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><SettingsPage /></ProtectedRoute>} />
              <Route path="/sms-log" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><SmsLog /></ProtectedRoute>} />
              <Route path="/steno" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Steno /></ProtectedRoute>} />
              <Route path="/steno/history" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><StenoHistory /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Contacts /></ProtectedRoute>} />
              <Route path="/files" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Files /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Leads /></ProtectedRoute>} />
              <Route path="/tasks" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><Tasks /></ProtectedRoute>} />
              <Route path="/inbox" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><InboxPage /></ProtectedRoute>} />
              <Route path="/beta-crm" element={<ProtectedRoute session={session} isOnboarded={isOnboarded}><BetaCrm /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            {session && isOnboarded && <InstallBanner />}
          </BrowserRouter>
          </AgentProvider>
        </IntegrationsProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;