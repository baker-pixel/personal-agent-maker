import { ArrowRight } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export const OnboardingWelcome = ({ onNext, onSkip }: Props) => (
  <div className="text-center">
    {/* Normy avatar with glow */}
    <div className="relative mb-8 animate-fade-up">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent/20 via-card to-primary/10 flex items-center justify-center mx-auto ring-1 ring-accent/20 shadow-xl shadow-accent/10 overflow-hidden">
        <img src={normyLogo} alt="Normy" className="h-16 w-auto" />
      </div>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-success text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-md">
        ONLINE
      </div>
    </div>

    {/* Chat-style welcome */}
    <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.15s" }}>
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-4 tracking-tight">
        Welcome to Normy's office
      </h2>
      <div className="bg-card border border-border/40 rounded-2xl rounded-tl-md px-5 py-4 text-left max-w-xs mx-auto shadow-sm">
        <p className="text-sm text-foreground leading-relaxed">
          Hey there! 👋 I'm <span className="font-semibold text-accent">Normy</span>, your new executive assistant.
        </p>
        <p className="text-sm text-foreground leading-relaxed mt-2">
          I handle your email, prep your meetings, and keep your day on track — <span className="text-muted-foreground italic">so you don't have to.</span>
        </p>
      </div>
    </div>

    {/* What I do cards */}
    <div className="space-y-2 mb-8 animate-fade-up" style={{ animationDelay: "0.3s" }}>
      <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest mb-3">Here's what I do for you</p>
      {[
        { emoji: "📬", label: "Triage your inbox", desc: "I read, categorize, and draft replies" },
        { emoji: "📅", label: "Prep your meetings", desc: "Context cards before every call" },
        { emoji: "☀️", label: "Morning briefings", desc: "Your day at a glance, every morning" },
        { emoji: "✅", label: "Track follow-ups", desc: "Nothing falls through the cracks" },
      ].map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3.5 bg-card/60 border border-border/20 rounded-xl px-4 py-3 text-left"
        >
          <span className="text-lg">{item.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "0.45s" }}>
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-2.5 bg-accent text-accent-foreground font-semibold py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-accent/10 text-base"
      >
        Let's get you set up
        <ArrowRight className="w-5 h-5" />
      </button>
      <button
        onClick={onSkip}
        className="w-full text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 transition-colors"
      >
        I'll explore on my own
      </button>
    </div>
  </div>
);
