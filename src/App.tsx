// @ts-nocheck
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStateContext } from "@/contexts/AppStateContext";
import { IntegrationsProvider } from "@/contexts/IntegrationsContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { useAppStateMachine } from "@/hooks/useAppStateMachine";
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
import AssessmentDone from "./pages/AssessmentDone";

const queryClient = new QueryClient();

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
  </div>
);

// ── Protected route ────────────────────────────────────────────────────────────
// Only reached when !booting (phase is UNAUTHENTICATED, ONBOARDING, READY, or ERROR).
// HYDRATING is blocked by the spinner in App, so isOnboarded is never null here.
const ProtectedRoute = ({
  authenticated,
  isOnboarded,
  children,
}: {
  authenticated: boolean;
  isOnboarded: boolean;
  children: React.ReactNode;
}) => {
  if (!authenticated) return <Navigate to="/auth" replace />;
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;
  return (
    <>
      <AppHeader />
      <ErrorBoundary variant="page">{children}</ErrorBoundary>
    </>
  );
};

// ── App root ───────────────────────────────────────────────────────────────────
const App = () => {
  const { state, fetchIntegrations, markOnboardingComplete, isRecovery, clearRecovery } = useAppStateMachine();

  const authenticated = !!state.session;

  // isOnboarded is only read when !booting (phase is READY, ONBOARDING, or UNAUTHENTICATED).
  // HYDRATING is blocked by the spinner below, so this is always a definite boolean.
  const isOnboarded = state.phase === "READY";

  // Block on BOOTING and HYDRATING.
  // HYDRATING is brief (< 200ms for a live session, 1.5s worst-case timeout).
  // Blocking here is the only safe way to prevent new users from seeing a
  // protected page before we know their onboarding status.
  const booting = state.phase === "BOOTING" || state.phase === "HYDRATING";

  // Providers are mounted outside the booting gate so their state-wiring
  // starts immediately on the first auth event.
  return (
    <ErrorBoundary variant="page">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppStateContext.Provider value={{ state, fetchIntegrations, markOnboardingComplete, clearRecovery }}>
            <IntegrationsProvider>
              <AgentProvider>
                <Toaster />
                <Sonner />
                <UpdatePrompt />
                {booting ? (
                  <Spinner />
                ) : (
                  <BrowserRouter>
                    <Routes>
                      {/* ── Public ───────────────────────────────────────── */}
                      <Route
                        path="/"
                        element={
                          isRecovery
                            ? <Navigate to="/reset-password" replace />
                            : authenticated
                            ? <Navigate to="/mode-select" replace />
                            : <Landing />
                        }
                      />
                      <Route
                        path="/auth"
                        element={
                          !authenticated
                            ? <Auth />
                            : isRecovery
                            ? <Navigate to="/reset-password" replace />
                            : <Navigate to="/mode-select" replace />
                        }
                      />
                      <Route path="/auth/google/callback" element={<GoogleCallback />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/investors" element={<Investors />} />
                      <Route path="/investors/contact" element={<InvestorContact />} />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route path="/assessment-done" element={<AssessmentDone />} />
                      <Route path="/done" element={<AssessmentDone />} />

                      {/* ── Onboarding ────────────────────────────────────── */}
                      <Route
                        path="/onboarding"
                        element={
                          !authenticated
                            ? <Navigate to="/auth" replace />
                            : isOnboarded === true
                            ? <Navigate to="/mode-select" replace />
                            : <Onboarding onComplete={markOnboardingComplete} initialEmail={state.session?.user?.email ?? ""} />
                        }
                      />

                      {/* ── Protected ─────────────────────────────────────── */}
                      <Route path="/mode-select" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><ModeSelect /></ProtectedRoute>} />
                      <Route path="/office" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Office /></ProtectedRoute>} />
                      <Route
                        path="/office-3d"
                        element={
                          <ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}>
                            <Suspense fallback={<Spinner />}>
                              <Office3D />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/dashboard" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><DashboardPage /></ProtectedRoute>} />
                      <Route path="/decision/text" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><DecisionText /></ProtectedRoute>} />
                      <Route path="/decision/voice" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><DecisionVoice /></ProtectedRoute>} />
                      <Route path="/email" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><EmailView /></ProtectedRoute>} />
                      <Route path="/calendar" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><CalendarView /></ProtectedRoute>} />
                      <Route path="/eod-wrapup" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><EodWrapup /></ProtectedRoute>} />
                      <Route path="/settings" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><SettingsPage /></ProtectedRoute>} />
                      <Route path="/sms-log" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><SmsLog /></ProtectedRoute>} />
                      <Route path="/steno" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Steno /></ProtectedRoute>} />
                      <Route path="/steno/history" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><StenoHistory /></ProtectedRoute>} />
                      <Route path="/contacts" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Contacts /></ProtectedRoute>} />
                      <Route path="/files" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Files /></ProtectedRoute>} />
                      <Route path="/leads" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Leads /></ProtectedRoute>} />
                      <Route path="/tasks" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><Tasks /></ProtectedRoute>} />
                      <Route path="/inbox" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><InboxPage /></ProtectedRoute>} />
                      <Route path="/beta-crm" element={<ProtectedRoute authenticated={authenticated} isOnboarded={isOnboarded}><BetaCrm /></ProtectedRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    {authenticated && isOnboarded && <InstallBanner />}
                  </BrowserRouter>
                )}
              </AgentProvider>
            </IntegrationsProvider>
          </AppStateContext.Provider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
