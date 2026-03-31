import { useState } from "react";
import { Bot, ArrowRight, ArrowLeft, Wand2 } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const SUGGESTIONS = ["Friday", "Jarvis", "Ada", "Scout", "Atlas", "Nova"];

export const OnboardingNameAgent = ({ onNext, onBack, onSkip }: Props) => {
  const { agentName, setAgentName } = useAgent();
  const [name, setName] = useState(agentName === "Normy Agent" ? "" : agentName);

  const handleContinue = () => {
    if (name.trim()) setAgentName(name.trim());
    else setAgentName("Normy Agent");
    onNext();
  };

  return (
    <div className="text-center">
      <div className="mb-8 animate-fade-up">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center mx-auto ring-1 ring-primary/15 shadow-lg shadow-primary/5">
          <Bot className="w-9 h-9 text-primary" />
        </div>
      </div>

      <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3 tracking-tight">
          Name your assistant
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
          Give it a personality. You can always change this in settings.
        </p>
      </div>

      <div className="mb-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleContinue()}
          placeholder="Type a name…"
          className="w-full px-5 py-4 rounded-2xl bg-card border border-border/40 text-foreground text-center text-lg font-semibold placeholder:text-muted-foreground/40 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 transition-all"
          autoFocus
        />
      </div>

      <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <p className="text-xs text-muted-foreground/60 mb-2.5 flex items-center justify-center gap-1">
          <Wand2 className="w-3 h-3" /> Need inspiration?
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              className={`px-3.5 py-1.5 rounded-xl text-sm border transition-all ${
                name === s
                  ? "bg-accent/10 border-accent/30 text-accent font-medium"
                  : "bg-card border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2.5 bg-accent text-accent-foreground font-semibold py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-accent/10 text-base"
        >
          {name.trim() ? `Continue as "${name.trim()}"` : "Continue with default name"}
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground py-2 px-3 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground py-2 px-3 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
