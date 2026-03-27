import { useState } from "react";
import { Bell, ArrowRight, ArrowLeft } from "lucide-react";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface PrefOption {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

const PREFS: PrefOption[] = [
  {
    id: "daily_briefing",
    label: "Daily Briefing",
    description: "Get an AI summary of your day every morning",
    defaultOn: true,
  },
  {
    id: "email_nudges",
    label: "Email Nudges",
    description: "Reminders when emails need follow-up",
    defaultOn: true,
  },
  {
    id: "meeting_prep",
    label: "Meeting Prep Alerts",
    description: "Auto-prep cards before your meetings",
    defaultOn: true,
  },
  {
    id: "task_reminders",
    label: "Task Reminders",
    description: "Nudge you about overdue action items",
    defaultOn: false,
  },
];

export const OnboardingPreferences = ({ onNext, onBack, onSkip }: Props) => {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("normy_preferences");
    if (saved) return JSON.parse(saved);
    return Object.fromEntries(PREFS.map((p) => [p.id, p.defaultOn]));
  });

  const toggle = (id: string) => {
    setPrefs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleContinue = () => {
    localStorage.setItem("normy_preferences", JSON.stringify(prefs));
    onNext();
  };

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Bell className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">Your preferences</h2>
        <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
          Choose what your assistant should proactively handle.
        </p>
      </div>

      <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {PREFS.map((pref) => {
          const isOn = prefs[pref.id] ?? pref.defaultOn;
          return (
            <button
              key={pref.id}
              onClick={() => toggle(pref.id)}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-4 border transition-all text-left ${
                isOn
                  ? "bg-accent/5 border-accent/20"
                  : "bg-card border-border/40 hover:border-border/60"
              }`}
            >
              <div
                className={`w-10 h-5 rounded-full relative transition-all shrink-0 ${
                  isOn ? "bg-accent" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    isOn ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
        <div className="flex justify-between">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground py-2 px-3 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground py-2 px-3 transition-colors">
            Skip for now
          </button>
        </div>
      </div>
    </>
  );
};
