import { Mail, Calendar, ArrowRight, ArrowLeft, Check, Shield, Loader2 } from "lucide-react";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useAgent } from "@/contexts/AgentContext";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import normyLogo from "@/assets/normy-logo.png";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const OnboardingConnect = ({ onNext, onBack, onSkip }: Props) => {
  const { connecting, connect } = useGoogleOAuthPopup();
  const { integrations } = useIntegrations();
  const { agentName } = useAgent();

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;
  const calendarConnected = integrations.find((i) => i.id === "google-calendar")?.connected;
  const anyConnected = gmailConnected || calendarConnected;
  const bothConnected = gmailConnected && calendarConnected;

  const handleConnect = (service: string) => {
    connect(service).catch(() => {});
  };

  const services = [
    {
      service: "gmail",
      connected: gmailConnected,
      label: "Gmail",
      desc: "So I can read, triage, and draft replies",
      Icon: Mail,
    },
    {
      service: "google-calendar",
      connected: calendarConnected,
      label: "Google Calendar",
      desc: "So I can prep meetings and manage your schedule",
      Icon: Calendar,
    },
  ];

  return (
    <div className="text-center">
      {/* Normy speech */}
      <div className="relative mb-6 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center mx-auto ring-1 ring-accent/15 shadow-lg overflow-hidden">
          <img src={normyLogo} alt={agentName} className="h-11 w-auto" />
        </div>
      </div>

      <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="bg-card border border-border/40 rounded-2xl rounded-tl-md px-5 py-4 text-left max-w-xs mx-auto shadow-sm mb-6">
          <p className="text-sm text-foreground leading-relaxed">
            {bothConnected ? (
              <>All set! 🎉 I've got access to everything I need. Let's get to work.</>
            ) : anyConnected ? (
              <>Nice! One down. Want to connect the other one too?</>
            ) : (
              <>Last step — <span className="font-semibold">I need access to your tools</span> to actually do my job. Think of it like giving your EA the office keys. 🔑</>
            )}
          </p>
        </div>

        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-2 tracking-tight">
          {bothConnected ? "You're all set!" : "Connect your accounts"}
        </h2>
      </div>

      <div className="space-y-3 mb-4 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {services.map(({ service, connected, label, desc, Icon }) => (
          <button
            key={service}
            onClick={() => !connected && handleConnect(service)}
            disabled={!!connected || connecting === service}
            className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4 border transition-all text-left ${
              connected
                ? "bg-success/5 border-success/20"
                : connecting === service
                ? "bg-card border-accent/30 opacity-80"
                : "bg-card/80 border-border/30 hover:border-accent/30 hover:bg-card cursor-pointer"
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              connected ? "bg-success/10" : "bg-muted/50"
            }`}>
              {connected ? (
                <Check className="w-5 h-5 text-success" />
              ) : connecting === service ? (
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
              ) : (
                <Icon className="w-5 h-5 text-muted-foreground" />
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
        <p className="text-xs text-muted-foreground/50">
          Secure OAuth — your passwords are never shared with us
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
          {bothConnected ? `Start using ${agentName}` : anyConnected ? "Finish setup" : "Skip — I'll connect later"}
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex justify-between items-center">
          <button onClick={onBack} className="text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 px-3 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          {!anyConnected && (
            <button onClick={onSkip} className="text-sm text-muted-foreground/50 hover:text-muted-foreground py-2 px-3 transition-colors">
              Skip all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
