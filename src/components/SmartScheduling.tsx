import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Calendar, Clock, Zap, Users, Sun, Moon, Coffee, ChevronRight } from "lucide-react";

interface TimeSlot {
  id: string;
  time: string;
  date: string;
  score: number;
  reason: string;
  type: "optimal" | "good" | "available";
  bufferBefore: number;
  bufferAfter: number;
  conflictsNearby: string[];
}

const mockSlots: TimeSlot[] = [
  { id: "1", time: "10:00 AM", date: "Tomorrow", score: 95, reason: "No meetings ±2 hours. Your most productive time based on past patterns.", type: "optimal", bufferBefore: 120, bufferAfter: 90, conflictsNearby: [] },
  { id: "2", time: "2:00 PM", date: "Tomorrow", score: 85, reason: "Good gap after lunch. 90 min buffer before next meeting.", type: "optimal", bufferBefore: 60, bufferAfter: 90, conflictsNearby: ["3:30 PM — Product sync"] },
  { id: "3", time: "11:00 AM", date: "Thursday", score: 78, reason: "Open morning slot. Standup at 9 AM gives 2-hour buffer.", type: "good", bufferBefore: 120, bufferAfter: 60, conflictsNearby: ["12:00 PM — Lunch with team"] },
  { id: "4", time: "3:00 PM", date: "Thursday", score: 72, reason: "Afternoon slot available. May overlap with focus time preference.", type: "good", bufferBefore: 60, bufferAfter: 120, conflictsNearby: [] },
  { id: "5", time: "9:00 AM", date: "Friday", score: 65, reason: "Early slot available but you typically prefer later starts on Fridays.", type: "available", bufferBefore: 0, bufferAfter: 60, conflictsNearby: ["10:00 AM — Weekly review"] },
];

const mockPreferences = {
  preferredMorning: "9:00 AM – 12:00 PM",
  preferredAfternoon: "1:30 PM – 4:00 PM",
  focusTime: "Deep work blocks: Tue/Thu mornings",
  bufferPreference: "30 min between meetings",
  avoidTimes: "No meetings before 9 AM or after 5 PM",
};

const scoreColors: Record<string, string> = {
  optimal: "bg-primary/10 text-primary border-primary/20",
  good: "bg-accent/10 text-accent border-accent/20",
  available: "bg-muted text-muted-foreground border-border",
};

export const SmartScheduling = () => {
  const { agentName } = useAgent();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Smart Scheduling</h1>
        <p className="text-muted-foreground">
          {agentName} finds optimal meeting times based on your calendar patterns and preferences.
        </p>
      </div>

      {/* Preferences summary */}
      <div className="glass-card rounded-2xl p-5 mb-6">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Scheduling Preferences</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Sun className="w-4 h-4 text-accent" />
            <span className="text-foreground">{mockPreferences.preferredMorning}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Coffee className="w-4 h-4 text-accent" />
            <span className="text-foreground">{mockPreferences.preferredAfternoon}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-accent" />
            <span className="text-foreground">{mockPreferences.bufferPreference}</span>
          </div>
        </div>
      </div>

      {/* Suggested slots */}
      <h2 className="font-display text-lg text-foreground mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        Suggested Time Slots
      </h2>

      <div className="space-y-3">
        {mockSlots.map((slot, index) => (
          <button
            key={slot.id}
            onClick={() => setSelectedSlot(selectedSlot === slot.id ? null : slot.id)}
            className={`w-full text-left glass-card rounded-2xl p-5 border transition-all duration-200 ${
              selectedSlot === slot.id ? "border-primary/30 ring-1 ring-primary/20" : "border-transparent hover:border-border"
            }`}
            style={{ animation: `fade-up 0.4s ease-out ${index * 0.08}s both` }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${scoreColors[slot.type]}`}>
                <span className="text-lg font-bold leading-none">{slot.score}</span>
                <span className="text-[9px] uppercase tracking-wider">score</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{slot.time}</h3>
                  <span className="text-xs text-muted-foreground">· {slot.date}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ml-auto ${scoreColors[slot.type]}`}>
                    {slot.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{slot.reason}</p>
                {slot.conflictsNearby.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    Nearby: {slot.conflictsNearby.join(", ")}
                  </div>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSlot === slot.id ? "rotate-90" : ""}`} />
            </div>

            {selectedSlot === slot.id && (
              <div className="mt-4 pt-4 border-t border-border flex items-center gap-4">
                <div className="flex-1 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <span>Buffer before: {slot.bufferBefore} min</span>
                  <span>Buffer after: {slot.bufferAfter} min</span>
                </div>
                <button className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  Schedule Here
                </button>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
