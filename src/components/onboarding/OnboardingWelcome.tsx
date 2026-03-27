import { Mail, Calendar, MessageSquare, ArrowRight } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export const OnboardingWelcome = ({ onNext, onSkip }: Props) => (
  <>
    <div className="flex justify-center mb-6">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
        <Sparkles className="w-7 h-7 text-accent" />
      </div>
    </div>

    <div className="text-center mb-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">Welcome to Normy</h2>
      <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
        Your AI executive assistant. Let's personalize your experience.
      </p>
    </div>

    <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
      {[
        { icon: Mail, label: "Smart email triage & auto-drafts" },
        { icon: Calendar, label: "Meeting prep & conflict detection" },
        { icon: MessageSquare, label: "One conversation for everything" },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <item.icon className="w-4 h-4 text-accent" />
          </div>
          <span className="text-sm text-foreground">{item.label}</span>
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
      >
        Let's go
        <ArrowRight className="w-4 h-4" />
      </button>
      <button onClick={onSkip} className="w-full text-sm text-muted-foreground hover:text-foreground py-2 transition-colors">
        Skip for now
      </button>
    </div>
  </>
);
