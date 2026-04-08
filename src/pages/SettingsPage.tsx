import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, User, Plug, Bell, Sparkles, ArrowRight, Loader2, X, Plus, MessageSquare, Mail, Lock, Eye, EyeOff, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmailTriageSettings from "@/components/EmailTriageSettings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AppMenu from "@/components/AppMenu";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

interface AgentSettings {
  agentName: string;
  phoneNumber: string;
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
  const [settings, setSettings] = useState<AgentSettings>(defaults);
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
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch {}
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

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

    // Register phone number for SMS if provided
    if (settings.phoneNumber) {
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
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="font-display font-semibold">Settings</h1>
          <AppMenu />
        </div>
      </nav>

      <div className="container py-8 max-w-lg space-y-8">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">SMS Access</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Text {settings.agentName} at <span className="font-mono font-semibold text-foreground">+1 (844) 392-6449</span> from this number. {settings.agentName} will recognize you and respond with AI-powered assistance.
          </p>
          <div className="flex gap-2">
            <Input type="tel" value={settings.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} placeholder="+1 (555) 123-4567" className="rounded-xl flex-1" />
            <Button onClick={save} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
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
                    onClick={() => removeAccount("gmail", email)}
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
                    onClick={() => removeAccount("google-calendar", email)}
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

        <EmailTriageSettings />

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

        <Button onClick={save} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {saved ? "Saved ✓" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
