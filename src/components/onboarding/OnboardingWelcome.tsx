import { Mail, Calendar, Brain, ArrowRight, Sparkles } from "lucide-react";

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export const OnboardingWelcome = ({ onNext, onSkip }: Props) => (
  <div className="text-center">
    <div className="relative mb-8 animate-fade-up">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center mx-auto ring-1 ring-accent/20 shadow-lg shadow-accent/5">
        <Sparkles className="w-9 h-9 text-accent" />
      </div>
      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success flex items-center justify-center text-white text-xs font-bold shadow-md mx-auto left-1/2 translate-x-8 -translate-y-0">
        ✦
      </div>
    </div>

    <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3 tracking-tight">
        Meet your AI<br />executive assistant
      </h2>
      <p className="text-muted-foreground text-sm md:text-base max-w-xs mx-auto leading-relaxed">
        Set up takes about 60 seconds. Connect your accounts and let AI handle the busywork.
      </p>
    </div>

    <div className="space-y-2.5 mb-10 animate-fade-up" style={{ animationDelay: "0.2s" }}>
      {[
        { icon: Mail, label: "Email triage", desc: "Auto-categorize & draft replies", color: "text-blue-400" },
        { icon: Calendar, label: "Meeting prep", desc: "Context cards before every call", color: "text-emerald-400" },
        { icon: Brain, label: "Daily briefings", desc: "Know what matters each morning", color: "text-violet-400" },
      ].map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-4 bg-card/80 backdrop-blur border border-border/30 rounded-2xl px-5 py-4 text-left transition-all hover:border-border/60"
        >
          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
            <item.icon className={`w-5 h-5 ${item.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "0.3s" }}>
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-2.5 bg-accent text-accent-foreground font-semibold py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-accent/10 text-base"
      >
        Get started
        <ArrowRight className="w-5 h-5" />
      </button>
      <button
        onClick={onSkip}
        className="w-full text-sm text-muted-foreground/60 hover:text-muted-foreground py-2 transition-colors"
      >
        I'll set up later
      </button>
    </div>
  </div>
);
