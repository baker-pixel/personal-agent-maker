// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Zap, Check, Bell, RotateCcw, ToggleLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

interface AgentSettingsProps {
  onReplayOnboarding?: () => void;
}

const FEATURES = [
  { id: "email_triage", label: "Email Triage", description: "Agent reads and categorizes your incoming emails" },
  { id: "calendar_sync", label: "Calendar Sync", description: "Agent accesses your calendar for scheduling and reminders" },
  { id: "lead_detection", label: "Lead Detection", description: "Agent identifies potential leads from emails and contacts" },
  { id: "daily_briefing", label: "Daily Briefing", description: "Morning summary of your day, emails, and priorities" },
  { id: "follow_up_tracking", label: "Follow-Up Tracking", description: "Track emails and tasks that need follow-up" },
  { id: "contact_sync", label: "Contact Sync", description: "Enrich and sync your contacts from email activity" },
];

const DEFAULT_FEATURES: Record<string, boolean> = {
  email_triage: true,
  calendar_sync: true,
  lead_detection: true,
  daily_briefing: true,
  follow_up_tracking: true,
  contact_sync: true,
};

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
    const stored = localStorage.getItem("normy_preferences");
    if (stored) return JSON.parse(stored);
    return { daily_briefing: true, email_nudges: true, meeting_prep: true, task_reminders: false };
  });
  const [features, setFeatures] = useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [featuresLoading, setFeaturesLoading] = useState(true);

  const loadFeatures = useCallback(async () => {
    const { data } = await supabase
      .from("user_preferences")
      .select("features_enabled")
      .maybeSingle();
    if (data?.features_enabled) {
      setFeatures({ ...DEFAULT_FEATURES, ...(data.features_enabled as Record<string, boolean>) });
    }
    setFeaturesLoading(false);
  }, []);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const toggleFeature = useCallback(async (id: string) => {
    const next = { ...features, [id]: !features[id] };
    setFeatures(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_preferences")
      .update({ features_enabled: next })
      .eq("user_id", user.id);
    if (error) {
      console.error("Failed to save feature toggle:", error.message);
      setFeatures(features);
    }
  }, [features]);

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
      <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both", animationDelay: "0.15s" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <ToggleLeft className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Features</h2>
            <p className="text-xs text-muted-foreground">Turn agent capabilities on or off</p>
          </div>
        </div>
        <div className="space-y-4">
          {featuresLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            FEATURES.map((feat) => (
              <div key={feat.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{feat.label}</p>
                  <p className="text-xs text-muted-foreground">{feat.description}</p>
                </div>
                <Switch checked={features[feat.id] ?? true} onCheckedChange={() => toggleFeature(feat.id)} />
              </div>
            ))
          )}
        </div>
      </div>

      {onReplayOnboarding && (
        <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both", animationDelay: "0.2s" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Onboarding</h2>
              <p className="text-xs text-muted-foreground">Replay the setup walkthrough</p>
            </div>
          </div>
          <button
            onClick={onReplayOnboarding}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted text-foreground font-medium text-sm hover:bg-muted/80 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Replay onboarding
          </button>
        </div>
      )}
    </div>
  );
};