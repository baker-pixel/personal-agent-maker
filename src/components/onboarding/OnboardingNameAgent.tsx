import { useState } from "react";
import { Zap, ArrowRight, ArrowLeft } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const OnboardingNameAgent = ({ onNext, onBack, onSkip }: Props) => {
  const { agentName, setAgentName } = useAgent();
  const [name, setName] = useState(agentName);

  const handleContinue = () => {
    if (name.trim()) setAgentName(name.trim());
    onNext();
  };

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Zap className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">Name your assistant</h2>
        <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
          Give your EA a name — you can always change it later.
        </p>
      </div>

      <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleContinue()}
          placeholder="e.g. Normy, Friday, Jarvis..."
          className="w-full px-4 py-4 rounded-xl bg-card border border-border/40 text-foreground text-center text-lg font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all"
          autoFocus
        />
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
