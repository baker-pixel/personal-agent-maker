// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, User, Plug, Bell, Sparkles, ArrowRight, Loader2, X, Plus, Mail, Eye, EyeOff, Check, Building2, BellRing, Flame, ListTodo, CheckCircle2, Brain } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/integrations/supabase/client";
import EmailTriageSettings from "@/components/EmailTriageSettings";
import { VoicePersonalizationSection } from "@/components/VoicePersonalizationSection";
import DailyBriefingRunner from "@/components/DailyBriefingRunner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
// Checkbox removed — SMS feature not yet launched
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";
import { useAgent } from "@/contexts/AgentContext";
import { useAppState } from "@/contexts/AppStateContext";
import { reloadAfterIntegrationChange } from "@/lib/integrationReload";

interface AgentSettings {
  agentName: string;
  userDisplayName: string;
  tone: string;
  emailLength: string;
  priorityVisibility: string;
  decisionStyle: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  emailSignature: string;
}

const defaults: AgentSettings = {
  agentName: "Annie",
  userDisplayName: "",
  tone: "friendly",
  emailLength: "balanced",
  priorityVisibility: "important",
  decisionStyle: "careful",
  notifyEmail: true,
  notifyPush: false,
  emailSignature: "",
};

type SettingsTab = "home" | "profile" | "integrations" | "email" | "notifications" | "account";

interface TabConfig {
  id: SettingsTab;
  label: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const TABS: TabConfig[] = [
  { id: "profile",       label: "Agent Profile",    description: "Name, tone & communication style",   icon: Sparkles,  iconBg: "bg-accent/15",        iconColor: "text-accent"         },
  { id: "integrations",  label: "Integrations",     description: "Gmail, Calendar & departments",        icon: Plug,      iconBg: "bg-blue-500/15",      iconColor: "text-blue-500"       },
  { id: "email",         label: "Email Settings",   description: "Triage rules, VIP senders & filters", icon: Mail,      iconBg: "bg-orange-500/15",    iconColor: "text-orange-500"     },
  { id: "notifications", label: "Notifications",    description: "Push alerts & background jobs",         icon: Bell,      iconBg: "bg-purple-500/15",    iconColor: "text-purple-500"     },
  { id: "account",       label: "Account",          description: "Email, password & privacy",            icon: User,      iconBg: "bg-green-500/15",     iconColor: "text-green-600"      },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state: appState } = useAppState();
  const { agentName, setAgentName } = useAgent();
  const [settings, setSettings] = useState<AgentSettings>({ ...defaults, agentName });
  const [activeTab, setActiveTab] = useState<SettingsTab>("home");
  const [retakingAssessment, setRetakingAssessment] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<string | null>(null);
  const { permission: pushPermission, requestPermission: requestPushPermission } = usePushNotifications();
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Support hash navigation → jump to correct tab
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash === "departments") setActiveTab("integrations");
    else if (["profile","integrations","email","notifications","account"].includes(hash)) {
      setActiveTab(hash as SettingsTab);
    }
  }, [location.hash]);

  const [saved, setSaved] = useState(false);
  const [voiceInitialData, setVoiceInitialData] = useState<{ userId: string; row: Record<string, any> } | undefined>();
  const { connecting, connect } = useGoogleOAuthPopup();
  const { isConnected, integrations, removeAccount, refreshConnections } = useIntegrations();
  const { toast } = useToast();
  const [userEmail, setUserEmail] = useState(appState.session?.user?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ provider: "gmail" | "google-calendar"; email: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    const target = pendingRemoval;
    setRemoving(true);
    try {
      await removeAccount(target.provider, target.email);
      toast({
        title: "Google account disconnected",
        description: `${target.email} has been removed and access revoked.`,
      });
      reloadAfterIntegrationChange();
    } catch (err) {
      toast({
        title: "Failed to disconnect",
        description: (err as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      // Always re-sync from the server so Settings reflects the true state,
      // and always close the dialog + clear loading regardless of outcome.
      try {
        await refreshConnections();
      } catch (e) {
        console.warn("refreshConnections after disconnect failed:", e);
      }
      setRemoving(false);
      setPendingRemoval(null);
    }
  };
  const [passwordChanged, setPasswordChanged] = useState(false);

  const gmailConnected = isConnected("gmail");
  const calendarConnected = isConnected("google-calendar");
  const gmailAccounts = integrations.find(i => i.id === "gmail")?.connectedAccounts || [];
  const calendarAccounts = integrations.find(i => i.id === "google-calendar")?.connectedAccounts || [];

  useEffect(() => {
    const loadSettings = async () => {
      // Use session from AppStateContext — already validated, no extra network call.
      // ProtectedRoute guarantees READY phase here, so session is never null.
      const user = appState.session?.user ?? null;

      if (user) {
        // One query fetches all columns needed by this page AND VoicePersonalizationSection
        const { data } = await supabase
          .from("user_preferences")
          .select("agent_name, user_display_name, tone, email_length, priority_visibility, decision_style, email_signature, tts_voice_uri, tts_rate, tts_pitch, tts_enabled, voice_conversation_enabled, stt_language, tts_provider, tts_elevenlabs_voice_id, sonic_voice_id, assessment_status")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          setSettings((prev) => ({
            ...prev,
            agentName: (data as any).agent_name ?? prev.agentName,
            userDisplayName: (data as any).user_display_name ?? prev.userDisplayName,
            tone: (data as any).tone ?? prev.tone,
            emailLength: (data as any).email_length ?? prev.emailLength,
            priorityVisibility: (data as any).priority_visibility ?? prev.priorityVisibility,
            decisionStyle: (data as any).decision_style ?? prev.decisionStyle,
            emailSignature: (data as any).email_signature ?? prev.emailSignature,
          }));
          setAssessmentStatus((data as any).assessment_status ?? null);
          // Pass voice columns to VoicePersonalizationSection so it skips its own fetch
          setVoiceInitialData({ userId: user.id, row: data as Record<string, any> });
          return;
        }
      }

      // Fallback to localStorage if DB load fails or no user yet
      const stored = localStorage.getItem("normy_agent");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSettings((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
    };
    loadSettings();
  }, []); // no deps — runs once on mount

  const handleChangePassword = async () => {
    if (newPassword.length < 12) {
      toast({ title: "Password too short", description: "Use at least 12 characters.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setPasswordChanged(true);
      setNewPassword("");
      toast({ title: "Password updated" });
      setTimeout(() => setPasswordChanged(false), 2000);
    }
  };

  const update = <K extends keyof AgentSettings>(key: K, val: AgentSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const save = async () => {
    localStorage.setItem("normy_agent", JSON.stringify(settings));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("user_preferences")
          .upsert(
            {
              user_id: user.id,
              agent_name: settings.agentName,
              user_display_name: settings.userDisplayName || null,
              tone: settings.tone,
              email_length: settings.emailLength,
              priority_visibility: settings.priorityVisibility,
              decision_style: settings.decisionStyle,
              email_signature: settings.emailSignature,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
    } catch (err) {
      console.error("Settings save error:", err);
    }

    if (settings.agentName && settings.agentName !== agentName) {
      setAgentName(settings.agentName);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async (service: string) => {
    try {
      await connect(service);
    } catch (err: any) {
      toast({
        title: "Connection failed",
        description: err.message || "Could not connect account",
        variant: "destructive",
      });
    }
  };

  const OptionBtn = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
        selected ? "bg-accent text-accent-foreground border-accent shadow-sm" : "bg-background text-foreground border-border hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      {/* Sticky header — just Back + title + contextual action */}
      <nav className="border-b bg-background sticky top-[var(--header-h)] z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => activeTab === "home" ? navigate(-1) : setActiveTab("home")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">{activeTab === "home" ? "Back" : "Settings"}</span>
          </button>
          <h1 className="font-display font-semibold">
            {activeTab === "home" ? "Settings" : TABS.find(t => t.id === activeTab)?.label ?? "Settings"}
          </h1>
          {(activeTab === "profile" || activeTab === "account") ? (
            <button
              onClick={save}
              className="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      </nav>

      <div className="container py-6 max-w-lg space-y-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">

        {/* ── Home — settings card grid ─────────────────────────────────── */}
        {activeTab === "home" && (
          <div style={{ animation: "fade-up 0.25s ease-out both" }}>
            {/* Agent summary card */}
            <div className="glass-card rounded-2xl p-5 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-2xl font-bold text-accent-foreground shrink-0">
                {(settings.agentName || agentName || "A").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-lg text-foreground">{settings.agentName || agentName}</p>
                <p className="text-sm text-muted-foreground">Your AI executive assistant</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                    {settings.tone} tone
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                    {settings.emailLength} emails
                  </span>
                </div>
              </div>
            </div>

            {/* Settings sections grid */}
            <div className="space-y-2">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-accent/30 hover:bg-accent/[0.02] transition-all group text-left"
                  >
                    <div className={`w-11 h-11 rounded-xl ${tab.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${tab.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{tab.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tab.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>

            {/* Agent feature pages */}
            <div className="mt-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Agent Features</p>
              <div className="space-y-2">
                {[
                  { label: `${settings.agentName || agentName}'s Office`, description: "Overview, status & agent activity", icon: Building2, iconBg: "bg-sky-500/15", iconColor: "text-sky-500", path: "/office" },
                  { label: "Leads", description: "Pipeline, prospects & follow-up tracking", icon: Flame, iconBg: "bg-orange-500/15", iconColor: "text-orange-500", path: "/leads" },
                  { label: "Tasks", description: "Delegated tasks & action items", icon: ListTodo, iconBg: "bg-violet-500/15", iconColor: "text-violet-500", path: "/tasks" },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-accent/30 hover:bg-accent/[0.02] transition-all group text-left"
                    >
                      <div className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${item.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Account ──────────────────────────────────────────────────── */}
        {activeTab === "account" && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Account</h2>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input value={userEmail} readOnly className="rounded-xl bg-muted cursor-default" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Change Password</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 12 chars)"
                  className="rounded-xl pr-10"
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : passwordChanged ? <><Check className="w-4 h-4" /> Done</> : "Update"}
              </Button>
            </div>
          </div>
        </section>}

        {/* SMS Access removed — feature not yet launched */}

        {activeTab === "profile" && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Agent Profile</h2>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Agent Name</label>
            <Input value={settings.agentName} onChange={(e) => update("agentName", e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">What should {settings.agentName || "your agent"} call you?</label>
            <Input
              value={settings.userDisplayName}
              onChange={(e) => update("userDisplayName", e.target.value)}
              placeholder="e.g. Alex, Boss, Captain…"
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground mt-1">Your agent will use this name when addressing you in messages and calls.</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Tone</label>
            <div className="flex flex-wrap gap-2">
              {["direct", "friendly", "formal"].map((t) => (
                <OptionBtn key={t} selected={settings.tone === t} onClick={() => update("tone", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Email length</label>
            <div className="flex flex-wrap gap-2">
              {["short", "balanced", "detailed"].map((t) => (
                <OptionBtn key={t} selected={settings.emailLength === t} onClick={() => update("emailLength", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Priority visibility</label>
            <div className="flex flex-wrap gap-2">
              {["urgent", "important", "all"].map((t) => (
                <OptionBtn key={t} selected={settings.priorityVisibility === t} onClick={() => update("priorityVisibility", t)}>
                  {t === "urgent" ? "Only urgent" : t.charAt(0).toUpperCase() + t.slice(1)}
                </OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Decision style</label>
            <div className="flex flex-wrap gap-2">
              {["fast", "careful"].map((t) => (
                <OptionBtn key={t} selected={settings.decisionStyle === t} onClick={() => update("decisionStyle", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email Signature</label>
            <textarea
              value={settings.emailSignature}
              onChange={(e) => update("emailSignature", e.target.value)}
              placeholder={"Best,\nYour Name\nTitle | Company"}
              rows={4}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-accent resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Appended automatically to every email you send through Normy.</p>
          </div>
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${assessmentStatus === "success" ? "bg-green-500/10" : "bg-accent/10"}`}>
                  {assessmentStatus === "success"
                    ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                    : <Brain className="w-5 h-5 text-accent" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">Personality Syncing</p>
                  {assessmentStatus === "success"
                    ? <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-0.5"><CheckCircle2 className="w-3 h-3" />Completed</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium mt-0.5">Not done yet</span>}
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {assessmentStatus === "success"
                ? `${settings.agentName} already has your personality profile. Retake the assessment anytime to refresh it — your communication style evolves.`
                : `Help ${settings.agentName} understand your communication style, pace, and preferences. Takes 3–5 minutes and makes a real difference in how the agent responds to you.`}
            </p>

            <Button
              disabled={retakingAssessment}
              className={`w-full ${assessmentStatus === "success" ? "bg-muted text-foreground hover:bg-muted/80 border" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
              variant={assessmentStatus === "success" ? "outline" : "default"}
              onClick={async () => {
                setRetakingAssessment(true);
                try {
                  const nameParts = (settings.userDisplayName || "").trim().split(/\s+/);
                  const firstName = nameParts[0] || "User";
                  const lastName = nameParts.slice(1).join(" ") || "-";
                  const { data, error } = await supabase.functions.invoke("assessment-proxy", {
                    body: { first_name: firstName, last_name: lastName, email: userEmail },
                  });
                  if (error) throw new Error(error.message);
                  if (data?.already_completed) {
                    toast({ title: "Assessment already completed", description: "Your personality profile is up to date." });
                    return;
                  }
                  if (data?.error) throw new Error(data.error);
                  if (!data?.assessment_url) throw new Error("No assessment URL returned");
                  window.location.href = data.assessment_url;
                } catch (err: any) {
                  toast({ title: "Couldn't start assessment", description: err?.message || "Please try again.", variant: "destructive" });
                } finally {
                  setRetakingAssessment(false);
                }
              }}
            >
              {retakingAssessment
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Starting…</>
                : assessmentStatus === "success"
                ? <>Retake Assessment <ArrowRight className="w-4 h-4 ml-1" /></>
                : <>Take Personality Assessment <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
          <VoicePersonalizationSection initialData={voiceInitialData} />
        </section>}

        {activeTab === "integrations" && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Connected Accounts</h2>
          </div>
          <div className="space-y-2">
            {/* Gmail */}
            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Gmail / Outlook</p>
                  <p className="text-xs text-muted-foreground">
                    {gmailAccounts.length > 0 ? `${gmailAccounts.length} account(s) connected` : "Not connected"}
                  </p>
                </div>
              </div>
              {gmailAccounts.map((email) => (
                <div key={email} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm truncate">{email}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingRemoval({ provider: "gmail", email })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleConnect("gmail")}
                disabled={connecting === "gmail"}
              >
                {connecting === "gmail" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting...</>
                ) : (
                  <><Plus className="w-3 h-3 mr-1" /> {gmailAccounts.length > 0 ? "Add another account" : "Connect Gmail"}</>
                )}
              </Button>
            </div>
            {/* Calendar */}
            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Calendar</p>
                  <p className="text-xs text-muted-foreground">
                    {calendarAccounts.length > 0 ? `${calendarAccounts.length} account(s) connected` : "Not connected"}
                  </p>
                </div>
              </div>
              {calendarAccounts.map((email) => (
                <div key={email} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm truncate">{email}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingRemoval({ provider: "google-calendar", email })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleConnect("google-calendar")}
                disabled={connecting === "google-calendar"}
              >
                {connecting === "google-calendar" ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting...</>
                ) : (
                  <><Plus className="w-3 h-3 mr-1" /> {calendarAccounts.length > 0 ? "Add another account" : "Connect Calendar"}</>
                )}
              </Button>
            </div>
          </div>
        </section>}

        {activeTab === "integrations" && <section id="departments" className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Departments</h2>
          </div>
          <p className="text-sm text-muted-foreground">Activate agent departments to expand your team's capabilities. Each department is $20/month.</p>
          <div className="space-y-2">
            {[
              { name: "Admin", description: "Email, calendar, scheduling & task management", active: true },
              { name: "HR", description: "Hiring, onboarding, policy & employee relations", active: false },
              { name: "Marketing", description: "Content, social media, campaigns & analytics", active: false },
              { name: "Bookkeeping", description: "Invoices, expenses, reports & reconciliation", active: false },
              { name: "Operations", description: "Workflows, vendors, inventory & logistics", active: false },
            ].map((dept) => (
              <div key={dept.name} className="flex items-center justify-between gap-3 border rounded-xl p-4">
                <div>
                  <p className="font-medium text-sm">{dept.name}</p>
                  <p className="text-xs text-muted-foreground">{dept.description}</p>
                </div>
                <div className="shrink-0">
                  {dept.active ? (
                    <span className="text-xs font-medium text-accent bg-accent/10 px-3 py-1 rounded-full">Active</span>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs" disabled>
                      Coming Soon
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>}

        {/* ── Email ────────────────────────────────────────────────────── */}
        {activeTab === "email" && <>
          <EmailTriageSettings />
        </>}

        {/* ── Notifications ────────────────────────────────────────────── */}
        {activeTab === "notifications" && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Notifications</h2>
          </div>
          <div className="space-y-2">
            {/* Push notifications — now actually works */}
            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Push notifications</p>
                  <p className="text-xs text-muted-foreground">
                    {pushPermission === "granted"
                      ? "Enabled — alerts for meetings, urgent emails & overdue tasks"
                      : pushPermission === "denied"
                      ? "Blocked — enable in browser site settings"
                      : "Get alerted for meetings, urgent emails & overdue tasks"}
                  </p>
                </div>
                {pushPermission === "granted" ? (
                  <span className="text-xs font-semibold text-green-600 bg-green-500/10 px-2 py-1 rounded-full">Enabled</span>
                ) : pushPermission === "denied" ? (
                  <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full">Blocked</span>
                ) : (
                  <Button size="sm" onClick={requestPushPermission} className="bg-accent text-accent-foreground text-xs h-8 rounded-lg flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5" />
                    Enable
                  </Button>
                )}
              </div>
            </div>

            {[
              { key: "notifyEmail" as const, label: "Email digests", desc: "Daily summary from your agent" },
            ].map((n) => (
              <div key={n.key} className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <p className="font-medium text-sm">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <Switch checked={settings[n.key]} onCheckedChange={(v) => update(n.key, v)} />
              </div>
            ))}
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="font-display font-semibold">Background Jobs</h2>
            </div>
            <DailyBriefingRunner />
          </div>
        </section>}

        {/* Save button — profile & account sections (also in header) */}
        {(activeTab === "profile" || activeTab === "account") && (
          <Button onClick={save} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl h-11">
            {saved ? <><Check className="w-4 h-4 mr-1.5" />Changes saved</> : "Save changes"}
          </Button>
        )}

        {/* Privacy policy — account tab only */}
        {activeTab === "account" && <div className="mt-6 pt-6 border-t space-y-4 text-xs text-muted-foreground">
          <h3 className="text-sm font-semibold text-foreground">Privacy Policy</h3>
          <p className="leading-relaxed"><strong className="text-foreground">Last updated:</strong> April 8, 2026</p>

          <p className="leading-relaxed">Normy Agent ("we", "our", "us") is committed to protecting your privacy. This policy describes what data we collect, how we use it, and your rights.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">1. Information We Collect</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Account info:</strong> Email address and password when you create an account.</li>
            <li><strong className="text-foreground">Google account data:</strong> When you connect Gmail or Google Calendar, we access your emails and calendar events to provide triage and scheduling features. We store OAuth tokens securely.</li>
            <li><strong className="text-foreground">Usage data:</strong> We log feature usage to improve the product experience.</li>
          </ul>

          <h4 className="text-xs font-semibold text-foreground pt-2">2. How We Use Your Information</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>To read and categorize your emails for inbox triage</li>
            <li>To read your calendar events for scheduling optimization</li>
            <li>To draft email replies for your review and approval</li>
            <li>To generate AI-powered responses, summaries, and action items</li>
          </ul>
          <p>We <strong className="text-foreground">never</strong> send emails, modify calendar events, or send texts without your explicit approval.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">3. Data Storage & Security</h4>
          <p>Your OAuth tokens are stored securely in an encrypted database. We do not store the full content of your emails or calendar events — we access them in real time and do not retain copies.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">4. Third-Party Services</h4>
          <p>We use Google APIs to access Gmail and Google Calendar. Our use complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including Limited Use requirements.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">5. Data Sharing</h4>
          <p>We do not sell, trade, or share your personal data with third parties. Your data is only used to provide the Normy Agent service.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">6. Your Rights</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Disconnect your Google account at any time from Integrations</li>
            <li>Delete your account and all associated data at any time</li>
            <li>Revoke access from your <a href="https://myaccount.google.com/permissions" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google Account permissions</a></li>
            <li>Contact us to delete your account and all associated data</li>
          </ul>

          <h4 className="text-xs font-semibold text-foreground pt-2">7. Contact</h4>
          <p>Questions about this policy? Reach out through the app or email us at support@normyagent.com.</p>
        </div>}
      </div>

      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => { if (!open && !removing) setPendingRemoval(null); }}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this Google account?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval ? (
                <>
                  This will revoke access for <span className="font-medium text-foreground">{pendingRemoval.email}</span> and remove it from both Gmail and Google Calendar. You can reconnect anytime.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmRemoval(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Disconnecting...</> : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="pt-6 pb-2 text-center select-all">
        <p className="text-base font-semibold text-foreground">
          Normy v{__APP_VERSION__}
        </p>
        <p className="text-sm text-muted-foreground">
          ({__COMMIT_HASH__}) · built {new Date(__BUILD_TIME__).toLocaleString()}
        </p>
      </div>
    </div>
  );
}