import { useState } from "react";
import { ArrowRight, ArrowLeft, Wand2 } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import normyLogo from "@/assets/normy-logo.png";

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
    const finalName = name.trim() || "Normy Agent";
    setAgentName(finalName);
    onNext();
  };

  const displayName = name.trim() || "Normy";

  return (
    <div className="text-center">
      {/* Normy speech */}
      <div className="relative mb-6 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center mx-auto ring-1 ring-accent/15 shadow-lg overflow-hidden">
          <img src={normyLogo} alt="Normy" className="h-11 w-auto" />
        </div>
      </div>

      <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="bg-card border border-border/40 rounded-2xl rounded-tl-md px-5 py-4 text-left max-w-xs mx-auto shadow-sm mb-6">
          <p className="text-sm text-foreground leading-relaxed">
            First things first — <span className="font-semibold">what should people call me?</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            I go by Normy, but you can rename me to anything you'd like.
          </p>
        </div>

        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-2 tracking-tight">
          Name your assistant
        </h2>
      </div>

      <div className="mb-4 animate-fade-up" style={{ animationDelay: "0.2s" }}>
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
        <p className="text-xs text-muted-foreground/50 mb-2.5 flex items-center justify-center gap-1">
          <Wand2 className="w-3 h-3" /> Or pick one
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
          Call me {displayName}
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex justify-between items-center">
          <button onClick={onBack} className="text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 px-3 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button onClick={onSkip} className="text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 px-3 transition-colors">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
