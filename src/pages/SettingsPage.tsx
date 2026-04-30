import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, User, Plug, Bell, Sparkles, ArrowRight, Loader2, X, Plus, MessageSquare, Mail, Eye, EyeOff, Check, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmailTriageSettings from "@/components/EmailTriageSettings";
import { VoicePersonalizationSection } from "@/components/VoicePersonalizationSection";
import DailyBriefingRunner from "@/components/DailyBriefingRunner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";
import { useAgent } from "@/contexts/AgentContext";

interface AgentSettings {
  agentName: string;
  phoneNumber: string;
  smsConsent: boolean;
  tone: string;
  emailLength: string;
  priorityVisibility: string;
  decisionStyle: string;
  notifySms: boolean;
  notifyEmail: boolean;
  notifyPush: boolean;
}

const defaults: AgentSettings = {
  agentName: "Annie",
  phoneNumber: "",
  smsConsent: false,
  tone: "friendly",
  emailLength: "balanced",
  priorityVisibility: "important",
  decisionStyle: "careful",
  notifySms: true,
  notifyEmail: true,
  notifyPush: false,
};

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agentName, setAgentName } = useAgent();
  const [settings, setSettings] = useState<AgentSettings>({ ...defaults, agentName });

  // Scroll to hash section (e.g. #departments)
  useEffect(() => {
    if (location.hash) {
      setTimeout(() => {
        document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [location.hash]);
  const [saved, setSaved] = useState(false);
  const { connecting, connect } = useGoogleOAuthPopup();
  const { isConnected, integrations, removeAccount } = useIntegrations();
  const { toast } = useToast();
  const [userEmail, setUserEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const gmailConnected = isConnected("gmail");
  const calendarConnected = isConnected("google-calendar");
  const gmailAccounts = integrations.find(i => i.id === "gmail")?.connectedAccounts || [];
  const calendarAccounts = integrations.find(i => i.id === "google-calendar")?.connectedAccounts || [];

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed, agentName }));
      } catch {}
    }

    const loadEmail = async () => {
      // Try session first (synchronous read of cached token), then getUser as fallback.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionEmail = sessionData.session?.user?.email;
      if (sessionEmail) {
        setUserEmail(sessionEmail);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.email) setUserEmail(userData.user.email);
    };
    loadEmail();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) setUserEmail(session.user.email);
    });
    return () => subscription.unsubscribe();
  }, [agentName]);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
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
    if (settings.agentName && settings.agentName !== agentName) {
      setAgentName(settings.agentName);
    }

    // Register phone number for SMS if provided and consent given
    if (settings.phoneNumber && settings.smsConsent) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const normalizedPhone = settings.phoneNumber.replace(/[^+\d]/g, "");
          
          // Upsert SMS conversation for this phone
          const { error: smsError } = await supabase
            .from("sms_conversations" as any)
            .upsert(
              { user_id: user.id, phone_number: normalizedPhone, messages: [] },
              { onConflict: "phone_number" }
            );
          
          if (smsError) console.error("SMS registration error:", smsError);

          // Also update user_preferences
          await supabase
            .from("user_preferences")
            .upsert(
              { user_id: user.id, phone_number: normalizedPhone } as any,
              { onConflict: "user_id" }
            );
        }
      } catch (err) {
        console.error("Failed to register phone for SMS:", err);
      }
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
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container flex items-center justify-between h-14 px-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="font-display font-semibold">Settings</h1>
          <div className="w-8" />
        </div>
      </nav>

      <div className="container py-6 sm:py-8 max-w-lg space-y-8 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Account / Login Info */}
        <section className="space-y-3">
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
                  placeholder="New password (min 6 chars)"
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
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">SMS Access</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Text {settings.agentName} at <span className="font-mono font-semibold text-foreground">+1 (844) 392-6449</span> from this number. {settings.agentName} will recognize you and respond with AI-powered assistance.
          </p>
          <div className="flex items-start gap-2 mt-1">
            <Checkbox
              id="sms-consent"
              checked={settings.smsConsent}
              onCheckedChange={(checked) => update("smsConsent", checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="sms-consent" className="text-sm text-muted-foreground cursor-pointer leading-snug">
              I consent to receive SMS messages from {settings.agentName} at the number I provide. Standard messaging rates may apply. You can revoke consent at any time by unchecking this box.
            </label>
          </div>
          <div className="flex gap-2">
            <Input type="tel" value={settings.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} placeholder="+1 (555) 123-4567" className="rounded-xl flex-1" disabled={!settings.smsConsent} />
            <Button onClick={save} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl" disabled={!settings.smsConsent || !settings.phoneNumber}>
              {saved ? "Saved ✓" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter your mobile number in E.164 format (e.g. +15551234567) and save to activate SMS.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Agent Profile</h2>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Agent Name</label>
            <Input value={settings.agentName} onChange={(e) => update("agentName", e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Tone</label>
            <div className="flex gap-2">
              {["direct", "friendly", "formal"].map((t) => (
                <OptionBtn key={t} selected={settings.tone === t} onClick={() => update("tone", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Email length</label>
            <div className="flex gap-2">
              {["short", "balanced", "detailed"].map((t) => (
                <OptionBtn key={t} selected={settings.emailLength === t} onClick={() => update("emailLength", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Priority visibility</label>
            <div className="flex gap-2">
              {["urgent", "important", "all"].map((t) => (
                <OptionBtn key={t} selected={settings.priorityVisibility === t} onClick={() => update("priorityVisibility", t)}>
                  {t === "urgent" ? "Only urgent" : t.charAt(0).toUpperCase() + t.slice(1)}
                </OptionBtn>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Decision style</label>
            <div className="flex gap-2">
              {["fast", "careful"].map((t) => (
                <OptionBtn key={t} selected={settings.decisionStyle === t} onClick={() => update("decisionStyle", t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</OptionBtn>
              ))}
            </div>
          </div>
          <div className="bg-card border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <label className="text-sm font-semibold">Personality Syncing</label>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">Retake the Bintly assessment to update {settings.agentName}'s behavioral profile.</p>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Retake Assessment <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </section>

        <section className="space-y-3">
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
                    onClick={async () => {
                      await removeAccount("gmail", email);
                      toast({ title: "Google account disconnected", description: `${email} has been removed and access revoked.` });
                      navigate("/settings", { replace: true });
                    }}
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
                    onClick={async () => {
                      await removeAccount("google-calendar", email);
                      toast({ title: "Google account disconnected", description: `${email} has been removed and access revoked.` });
                      navigate("/settings", { replace: true });
                    }}
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
        </section>

        <section id="departments" className="space-y-3">
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
              <div key={dept.name} className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <p className="font-medium text-sm">{dept.name}</p>
                  <p className="text-xs text-muted-foreground">{dept.description}</p>
                </div>
                {dept.active ? (
                  <span className="text-xs font-medium text-accent bg-accent/10 px-3 py-1 rounded-full">Active</span>
                ) : (
                  <Button variant="outline" size="sm" className="text-xs" disabled>
                    Coming Soon
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        <EmailTriageSettings />

        <VoicePersonalizationSection />

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Notifications</h2>
          </div>
          <div className="space-y-2">
            {[
              { key: "notifySms" as const, label: "SMS notifications", desc: "Get texts when action is needed" },
              { key: "notifyEmail" as const, label: "Email digests", desc: "Daily summary from your agent" },
              { key: "notifyPush" as const, label: "Push notifications", desc: "Browser notifications (coming soon)" },
            ].map((n) => (
              <div key={n.key} className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <p className="font-medium text-sm">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <Switch checked={settings[n.key]} onCheckedChange={(v) => update(n.key, v)} disabled={n.key === "notifyPush"} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Background Jobs</h2>
          </div>
          <DailyBriefingRunner />
        </section>

        <Button onClick={save} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {saved ? "Saved ✓" : "Save Changes"}
        </Button>

        <div className="mt-10 pt-6 border-t space-y-4 text-xs text-muted-foreground">
          <h3 className="text-sm font-semibold text-foreground">Privacy Policy</h3>
          <p className="leading-relaxed"><strong className="text-foreground">Last updated:</strong> April 8, 2026</p>

          <p className="leading-relaxed">Normy Agent ("we", "our", "us") is committed to protecting your privacy. This policy describes what data we collect, how we use it, and your rights.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">1. Information We Collect</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Account info:</strong> Email address and password when you create an account.</li>
            <li><strong className="text-foreground">Google account data:</strong> When you connect Gmail or Google Calendar, we access your emails and calendar events to provide triage and scheduling features. We store OAuth tokens securely.</li>
            <li><strong className="text-foreground">Phone number:</strong> If you opt in to SMS, we store your mobile number to enable text-based communication with your agent.</li>
          </ul>

          <h4 className="text-xs font-semibold text-foreground pt-2">2. How We Use Your Information</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>To read and categorize your emails for inbox triage</li>
            <li>To read your calendar events for scheduling optimization</li>
            <li>To draft email replies for your review and approval</li>
            <li>To send and receive SMS messages on your behalf (with consent)</li>
          </ul>
          <p>We <strong className="text-foreground">never</strong> send emails, modify calendar events, or send texts without your explicit approval.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">3. Data Storage & Security</h4>
          <p>Your OAuth tokens are stored securely in an encrypted database. We do not store the full content of your emails or calendar events — we access them in real time and do not retain copies.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">4. Third-Party Services</h4>
          <p>We use Google APIs to access Gmail and Google Calendar. Our use complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including Limited Use requirements. SMS is powered by Twilio.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">5. Data Sharing</h4>
          <p>We do not sell, trade, or share your personal data with third parties. Your data is only used to provide the Normy Agent service.</p>

          <h4 className="text-xs font-semibold text-foreground pt-2">6. Your Rights</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Disconnect your Google account at any time from Integrations</li>
            <li>Delete your account and all associated data at any time</li>
            <li>Revoke access from your <a href="https://myaccount.google.com/permissions" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">Google Account permissions</a></li>
            <li>Opt out of SMS at any time by unchecking consent above</li>
          </ul>

          <h4 className="text-xs font-semibold text-foreground pt-2">7. Contact</h4>
          <p>Questions about this policy? Reach out through the app or email us at support@normyagent.com.</p>
        </div>
      </div>
    </div>
  );
}
