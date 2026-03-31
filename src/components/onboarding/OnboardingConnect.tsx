import { useState } from "react";
import { Mail, Calendar, ArrowRight, ArrowLeft, Check, Shield, Loader2 } from "lucide-react";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const OnboardingConnect = ({ onNext, onBack, onSkip }: Props) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const { integrations } = useIntegrations();
  const { agentName } = useAgent();

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;
  const calendarConnected = integrations.find((i) => i.id === "google-calendar")?.connected;
  const anyConnected = gmailConnected || calendarConnected;

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

  const services = [
    {
      service: "gmail",
      connected: gmailConnected,
      label: "Gmail",
      desc: "Read, triage, and draft email replies",
      Icon: Mail,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      service: "google-calendar",
      connected: calendarConnected,
      label: "Google Calendar",
      desc: "Meeting prep, conflicts, and scheduling",
      Icon: Calendar,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="text-center">
      <div className="mb-8 animate-fade-up">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500/15 to-emerald-500/10 flex items-center justify-center mx-auto ring-1 ring-blue-500/15 shadow-lg shadow-blue-500/5">
          <Mail className="w-9 h-9 text-blue-400" />
        </div>
      </div>

      <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3 tracking-tight">
          Connect your accounts
        </h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
          {agentName} needs access to work on your behalf. You can add more accounts later.
        </p>
      </div>

      <div className="space-y-3 mb-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {services.map(({ service, connected, label, desc, Icon, color, bgColor }) => (
          <button
            key={service}
            onClick={() => !connected && handleConnect(service)}
            disabled={!!connected || connecting === service}
            className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4.5 border transition-all text-left ${
              connected
                ? "bg-success/5 border-success/20"
                : connecting === service
                ? "bg-card border-accent/30 opacity-80"
                : "bg-card/80 border-border/30 hover:border-accent/30 hover:bg-card cursor-pointer"
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${connected ? "bg-success/10" : bgColor}`}>
              {connected ? (
                <Check className="w-5 h-5 text-success" />
              ) : connecting === service ? (
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
              ) : (
                <Icon className={`w-5 h-5 ${color}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {connected ? `${label} connected ✓` : connecting === service ? "Connecting…" : `Connect ${label}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 mb-8 animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <Shield className="w-3.5 h-3.5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground/60">
          OAuth sign-in — your credentials are never stored
        </p>
      </div>

      <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={onNext}
          className={`w-full flex items-center justify-center gap-2.5 font-semibold py-4 rounded-2xl transition-all text-base ${
            anyConnected
              ? "bg-accent text-accent-foreground shadow-lg shadow-accent/10 hover:opacity-90"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {anyConnected ? "Finish setup" : "Skip — I'll connect later"}
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground py-2 px-3 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          {!anyConnected && (
            <button
              onClick={onSkip}
              className="text-sm text-muted-foreground/60 hover:text-muted-foreground py-2 px-3 transition-colors"
            >
              Skip all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
