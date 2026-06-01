import { Mail, Calendar, Loader2, AlertTriangle, Plug } from "lucide-react";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { useIntegrations } from "@/contexts/IntegrationsContext";

type Integration = "gmail" | "calendar" | "both";

interface Props {
  integration: Integration;
  /** inline = small banner; page = full centered empty state */
  variant?: "page" | "inline";
  agentName?: string;
}

const CONFIG = {
  gmail: {
    icon: Mail,
    title: "Connect Gmail",
    description: "Connect your Gmail so your agent can triage your inbox, send emails, and track follow-ups.",
    service: "gmail",
    label: "Connect Gmail",
  },
  calendar: {
    icon: Calendar,
    title: "Connect Calendar",
    description: "Connect your Google Calendar to view events, detect conflicts, and manage your schedule.",
    service: "google-calendar",
    label: "Connect Calendar",
  },
  both: {
    icon: Plug,
    title: "Connect Gmail & Calendar",
    description: "Your agent needs Gmail and Google Calendar access to work. Connect now to get started.",
    service: "gmail",
    label: "Connect Google",
  },
};

export function NotConnectedState({ integration, variant = "page", agentName }: Props) {
  const { connecting, connect } = useGoogleOAuthPopup();
  const { integrationsLoading } = useIntegrations();
  const cfg = CONFIG[integration];
  const Icon = cfg.icon;
  const isConnecting = connecting === cfg.service || connecting === "gmail";

  if (integrationsLoading) {
    return variant === "page" ? (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    ) : null;
  }

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm mx-3 mt-2 mb-2 overflow-hidden"
      >
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0 truncate">
          <span className="font-medium text-foreground">{cfg.title} required</span>
          <span className="text-muted-foreground ml-1 hidden sm:inline">— {agentName ?? "Your agent"} is limited without it.</span>
        </div>
        <button
          onClick={() => connect(cfg.service)}
          disabled={isConnecting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60 shrink-0 whitespace-nowrap"
        >
          {isConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {isConnecting ? "Connecting…" : "Connect"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-8 h-8 text-accent" />
        </div>
        <h2 className="font-display text-xl font-semibold mb-2">{cfg.title}</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{cfg.description}</p>
        <button
          onClick={() => connect(cfg.service)}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
          {isConnecting ? "Connecting…" : cfg.label}
        </button>
      </div>
    </div>
  );
}
