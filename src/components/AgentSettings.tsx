import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Zap, Check, Bell, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface AgentSettingsProps {
  onReplayOnboarding?: () => void;
}

const PREFS = [
  { id: "daily_briefing", label: "Daily Briefing", description: "Get an AI summary of your day every morning" },
  { id: "email_nudges", label: "Email Nudges", description: "Reminders when emails need follow-up" },
  { id: "meeting_prep", label: "Meeting Prep Alerts", description: "Auto-prep cards before your meetings" },
  { id: "task_reminders", label: "Task Reminders", description: "Nudge you about overdue action items" },
];

export const AgentSettings = ({ onReplayOnboarding }: AgentSettingsProps) => {
  const { agentName, setAgentName } = useAgent();
  const [nameInput, setNameInput] = useState(agentName);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("normy_preferences");
    if (saved) return JSON.parse(saved);
    return { daily_briefing: true, email_nudges: true, meeting_prep: true, task_reminders: false };
  });

  const handleSave = () => {
    if (nameInput.trim()) {
      setAgentName(nameInput.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const togglePref = (id: string) => {
    setPrefs((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem("normy_preferences", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">Customize your AI executive assistant.</p>
      </div>

      <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Agent Identity</h2>
            <p className="text-xs text-muted-foreground">Give your assistant a name</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-foreground mb-2">
              Agent Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all"
              placeholder="Enter agent name..."
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!nameInput.trim() || nameInput.trim() === agentName}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both", animationDelay: "0.1s" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Proactive Features</h2>
            <p className="text-xs text-muted-foreground">Choose what your assistant handles automatically</p>
          </div>
        </div>

        <div className="space-y-4">
          {PREFS.map((pref) => (
            <div key={pref.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.description}</p>
              </div>
              <Switch checked={prefs[pref.id] ?? false} onCheckedChange={() => togglePref(pref.id)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};