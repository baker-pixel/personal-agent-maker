import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, User, Plug, Bell, Sparkles, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AppMenu from "@/components/AppMenu";

interface AgentSettings {
  agentName: string;
  phoneNumber: string;
  email: boolean;
  calendar: boolean;
  gmailConnected: boolean;
  calendarConnected: boolean;
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
  email: true,
  calendar: true,
  gmailConnected: false,
  calendarConnected: false,
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

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch {}
    }
  }, []);

  const update = <K extends keyof AgentSettings>(key: K, val: AgentSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const save = () => {
    localStorage.setItem("normy_agent", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <Phone className="w-5 h-5 text-accent" />
            <h2 className="font-display font-semibold">Phone Number</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Your primary interactions with {settings.agentName} are designed to be on the go. Give {settings.agentName} your phone so she can recognize you when you text.
          </p>
          <Input type="tel" value={settings.phoneNumber} onChange={(e) => update("phoneNumber", e.target.value)} placeholder="+1 (555) 123-4567" className="rounded-xl" />
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
            <div className="flex items-center justify-between border rounded-xl p-4">
              <div>
                <p className="font-medium text-sm">Gmail / Outlook</p>
                <p className="text-xs text-muted-foreground">{settings.gmailConnected ? "Connected" : "Not connected"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => update("gmailConnected", !settings.gmailConnected)}>
                {settings.gmailConnected ? "Disconnect" : "Connect"}
              </Button>
            </div>
            <div className="flex items-center justify-between border rounded-xl p-4">
              <div>
                <p className="font-medium text-sm">Calendar</p>
                <p className="text-xs text-muted-foreground">{settings.calendarConnected ? "Connected" : "Not connected"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => update("calendarConnected", !settings.calendarConnected)}>
                {settings.calendarConnected ? "Disconnect" : "Connect"}
              </Button>
            </div>
          </div>
        </section>

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
