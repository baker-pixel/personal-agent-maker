import { useState } from "react";
import { Mail, Calendar, MessageSquare, Sparkles, ArrowRight, Check, Zap } from "lucide-react";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const steps = [
  {
    id: "welcome",
    title: "Welcome to Normy",
    subtitle: "Your AI executive assistant. Let's get you set up in 60 seconds.",
    icon: Sparkles,
  },
  {
    id: "connect",
    title: "Connect your tools",
    subtitle: "Normy needs access to your email and calendar to work its magic.",
    icon: Zap,
  },
  {
    id: "ready",
    title: "You're all set!",
    subtitle: "Try asking Normy to triage your inbox or prep your next meeting.",
    icon: Check,
  },
];

export const OnboardingFlow = ({ onComplete, onSkip }: OnboardingFlowProps) => {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const { integrations } = useIntegrations();

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;
  const calendarConnected = integrations.find((i) => i.id === "google-calendar")?.connected;

  const handleConnect = async (service: string) => {
    setConnecting(service);
    try {
      const response = await supabase.functions.invoke("google-auth", {
        body: { service },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (url) window.location.href = url;
    } catch {
      setConnecting(null);
    }
  };

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-10">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-8 bg-accent" : i < step ? "w-4 bg-accent/40" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
            <StepIcon className="w-7 h-7 text-accent" />
          </div>
        </div>

        {/* Step content */}
        <div className="text-center mb-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">
            {currentStep.title}
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
            {currentStep.subtitle}
          </p>
        </div>

        {/* Step-specific content */}
        {step === 0 && (
          <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            {[
              { icon: Mail, label: "Smart email triage & auto-drafts" },
              { icon: Calendar, label: "Meeting prep & conflict detection" },
              { icon: MessageSquare, label: "One conversation for everything" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-4 py-3"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-accent" />
                </div>
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <button
              onClick={() => handleConnect("gmail")}
              disabled={!!gmailConnected || connecting === "gmail"}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-4 border transition-all ${
                gmailConnected
                  ? "bg-success/5 border-success/20"
                  : "bg-card border-border/40 hover:border-accent/30 cursor-pointer"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                gmailConnected ? "bg-success/10" : "bg-accent/10"
              }`}>
                {gmailConnected ? (
                  <Check className="w-5 h-5 text-success" />
                ) : (
                  <Mail className="w-5 h-5 text-accent" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">
                  {gmailConnected ? "Gmail connected" : "Connect Gmail"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {gmailConnected ? "Reading and drafting emails" : "Triage, drafts, and follow-ups"}
                </p>
              </div>
              {!gmailConnected && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
            </button>

            <button
              onClick={() => handleConnect("google-calendar")}
              disabled={!!calendarConnected || connecting === "google-calendar"}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-4 border transition-all ${
                calendarConnected
                  ? "bg-success/5 border-success/20"
                  : "bg-card border-border/40 hover:border-accent/30 cursor-pointer"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                calendarConnected ? "bg-success/10" : "bg-accent/10"
              }`}>
                {calendarConnected ? (
                  <Check className="w-5 h-5 text-success" />
                ) : (
                  <Calendar className="w-5 h-5 text-accent" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">
                  {calendarConnected ? "Calendar connected" : "Connect Google Calendar"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {calendarConnected ? "Prep, conflicts, and scheduling" : "Meeting prep and scheduling"}
                </p>
              </div>
              {!calendarConnected && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            {[
              "\"Give me my morning briefing\"",
              "\"Triage my inbox\"",
              "\"Auto-draft replies for my emails\"",
              "\"Prep me for my next meeting\"",
            ].map((suggestion, i) => (
              <div
                key={i}
                className="bg-card border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground/80 italic"
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
          {step < steps.length - 1 ? (
            <>
              <button
                onClick={() => setStep(step + 1)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
              >
                {step === 0 ? "Let's go" : "Continue"}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onSkip}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
              >
                Skip for now
              </button>
            </>
          ) : (
            <button
              onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
            >
              Start using Normy
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
