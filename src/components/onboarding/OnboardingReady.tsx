import { Check, Sparkles } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";

interface Props {
  onComplete: () => void;
}

export const OnboardingReady = ({ onComplete }: Props) => {
  const { agentName } = useAgent();

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Check className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">You're all set!</h2>
        <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
          Try asking {agentName} to triage your inbox or prep your next meeting.
        </p>
      </div>

      <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {[
          `"Give me my morning briefing"`,
          `"Triage my inbox"`,
          `"Auto-draft replies for my emails"`,
          `"Prep me for my next meeting"`,
        ].map((suggestion, i) => (
          <div key={i} className="bg-card border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground/80 italic">
            {suggestion}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={onComplete}
          className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
        >
          Start using {agentName}
          <Sparkles className="w-4 h-4" />
        </button>
      </div>
    </>
  );
};
