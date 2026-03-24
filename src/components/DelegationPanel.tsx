import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Shield, ChevronRight } from "lucide-react";

interface DelegationLevel {
  id: number;
  label: string;
  description: string;
  examples: string[];
}

const levels: DelegationLevel[] = [
  {
    id: 0,
    label: "Approve Everything",
    description: "Every proposed action requires your explicit approval before execution.",
    examples: ["Email drafts shown before sending", "Calendar changes need confirmation", "All follow-ups require sign-off"],
  },
  {
    id: 1,
    label: "Ask When Unusual",
    description: "Routine actions proceed automatically. Unusual or high-impact actions require approval.",
    examples: ["Standard replies auto-sent", "New contacts flagged for review", "Large commitments require approval"],
  },
  {
    id: 2,
    label: "Auto-Do With Guardrails",
    description: "Most actions are handled autonomously within defined boundaries.",
    examples: ["Emails sent with tone checking", "Calendar optimized automatically", "Spending limits enforced"],
  },
  {
    id: 3,
    label: "Exception-Only Escalation",
    description: "Full autonomy. Only true exceptions or edge cases are escalated to you.",
    examples: ["Full inbox management", "Autonomous scheduling", "Only crises escalated"],
  },
];

export const DelegationPanel = () => {
  const { agentName } = useAgent();
  const [currentLevel, setCurrentLevel] = useState(0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Delegation Level</h1>
        <p className="text-muted-foreground">
          Control how much autonomy {agentName} has. Build trust gradually, just like a real assistant.
        </p>
      </div>

      <div className="space-y-3">
        {levels.map((level, index) => {
          const isActive = currentLevel === level.id;
          const isPast = currentLevel > level.id;
          return (
            <button
              key={level.id}
              onClick={() => setCurrentLevel(level.id)}
              className={`w-full text-left glass-card rounded-2xl p-6 transition-all duration-300 ${
                isActive ? "ring-2 ring-accent approval-glow" : "hover:bg-card"
              }`}
              style={{ animation: `fade-up 0.4s ease-out ${index * 0.1}s both` }}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? "bg-accent text-accent-foreground" : isPast ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{level.label}</h3>
                    {isActive && (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{level.description}</p>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? "rotate-90 text-accent" : "text-muted-foreground"}`} />
              </div>

              {isActive && (
                <div className="mt-4 ml-14 space-y-2">
                  {level.examples.map((example, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                      {example}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
