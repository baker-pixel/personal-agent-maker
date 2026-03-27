import { useState } from "react";
import { Mail, Calendar, Zap, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const OnboardingConnect = ({ onNext, onBack, onSkip }: Props) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const { integrations } = useIntegrations();

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;
  const calendarConnected = integrations.find((i) => i.id === "google-calendar")?.connected;

  const handleConnect = async (service: string) => {
    setConnecting(service);
    try {
      const response = await supabase.functions.invoke("google-auth", { body: { service } });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (url) window.location.href = url;
    } catch {
      setConnecting(null);
    }
  };

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Zap className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">Connect your tools</h2>
        <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
          Your assistant needs access to email and calendar to work its magic.
        </p>
      </div>

      <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {[
          { service: "gmail", connected: gmailConnected, label: "Gmail", connectedLabel: "Gmail connected", desc: "Triage, drafts, and follow-ups", connectedDesc: "Reading and drafting emails", Icon: Mail },
          { service: "google-calendar", connected: calendarConnected, label: "Google Calendar", connectedLabel: "Calendar connected", desc: "Meeting prep and scheduling", connectedDesc: "Prep, conflicts, and scheduling", Icon: Calendar },
        ].map(({ service, connected, label, connectedLabel, desc, connectedDesc, Icon }) => (
          <button
            key={service}
            onClick={() => handleConnect(service)}
            disabled={!!connected || connecting === service}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-4 border transition-all ${
              connected
                ? "bg-success/5 border-success/20"
                : "bg-card border-border/40 hover:border-accent/30 cursor-pointer"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${connected ? "bg-success/10" : "bg-accent/10"}`}>
              {connected ? <Check className="w-5 h-5 text-success" /> : <Icon className="w-5 h-5 text-accent" />}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-foreground">{connected ? connectedLabel : `Connect ${label}`}</p>
              <p className="text-xs text-muted-foreground">{connected ? connectedDesc : desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={onNext}
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
