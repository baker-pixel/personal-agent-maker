import { useState, useEffect } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail,
  Calendar,
  MessageSquare,
  Check,
  ChevronRight,
  ExternalLink,
  Unplug,
  Shield,
  Zap,
  LogOut,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SignOutDialog from "@/components/SignOutDialog";
import { SlackChannelSelector } from "@/components/SlackChannelSelector";

const iconMap: Record<string, React.ElementType> = {
  mail: Mail,
  calendar: Calendar,
  message: MessageSquare,
};

const GOOGLE_PROVIDERS = ["gmail", "google-calendar"];

export const IntegrationsSetup = () => {
  const { agentName } = useAgent();
  const { integrations, toggleConnection, removeAccount, refreshConnections } = useIntegrations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingKey, setDisconnectingKey] = useState<string | null>(null);
  const { connecting: popupConnecting, connect: popupConnect } = useGoogleOAuthPopup();
  const { toast } = useToast();

  const connectedCount = integrations.filter((i) => i.connected).length;

  const handleConnect = async (id: string) => {
    if (GOOGLE_PROVIDERS.includes(id)) {
      try {
        await popupConnect(id);
      } catch (error: any) {
        console.error("Google connect error:", error);
        toast({
          title: "Connection failed",
          description: error.message || "Could not start Google sign-in",
          variant: "destructive",
        });
      }
      return;
    }

    // Non-Google: keep mock behavior
    setConnectingId(id);
    await new Promise((r) => setTimeout(r, 1500));
    toggleConnection(id);
    setConnectingId(null);
  };

  const handleDisconnect = async (id: string, email?: string) => {
    if (GOOGLE_PROVIDERS.includes(id) && email) {
      const key = `${id}:${email}`;
      if (disconnectingKey) return; // prevent double-clicks / race conditions
      setDisconnectingKey(key);
      try {
        await removeAccount(id, email);
        toast({
          title: "Account disconnected",
          description: `${email} has been removed.`,
        });
      } catch (err: any) {
        toast({
          title: "Error",
          description: err?.message || "Failed to disconnect account",
          variant: "destructive",
        });
      } finally {
        // Always re-sync so the UI reflects authoritative server state,
        // even if the delete or revoke call failed.
        try {
          await refreshConnections();
        } catch (e) {
          console.warn("refreshConnections after disconnect failed:", e);
        }
        setDisconnectingKey(null);
      }
      return;
    }
    toggleConnection(id);
  };

  // Sign out is now handled by SignOutDialog

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-2">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your accounts so {agentName} can manage your inbox, calendar, and communications.
          </p>
        </div>
        <SignOutDialog>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </SignOutDialog>
      </div>

      {connectedCount > 0 && (
        <div
          className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3"
          style={{ animation: "fade-up 0.3s ease-out both" }}
        >
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {connectedCount} integration{connectedCount !== 1 ? "s" : ""} active
            </p>
            <p className="text-xs text-muted-foreground">
              {agentName} is monitoring your connected accounts
            </p>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-accent" />
        </div>
        <p className="text-sm text-muted-foreground">
          You can connect multiple Google accounts. Each one will be monitored separately.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-6" style={{ animation: "fade-up 0.3s ease-out 0.1s both" }}>
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          How setup works
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { step: "1", title: "Connect accounts", desc: "Sign in with OAuth — your credentials are never stored directly." },
            { step: "2", title: "Set preferences", desc: "Choose what to monitor, VIP senders, working hours, and priority rules." },
            { step: "3", title: "Review & approve", desc: `${agentName} proposes actions in your Approval Inbox. You stay in control.` },
          ].map((s) => (
            <div key={s.step} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {s.step}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {integrations.map((integration, index) => {
          const Icon = iconMap[integration.icon] || Mail;
          const isExpanded = expandedId === integration.id;
          const isConnecting = connectingId === integration.id || popupConnecting === integration.id;
          const accounts = integration.connectedAccounts;

          return (
            <div
              key={integration.id}
              className={`glass-card rounded-2xl overflow-hidden transition-all duration-300 ${
                integration.connected ? "ring-1 ring-success/30" : ""
              }`}
              style={{ animation: `fade-up 0.4s ease-out ${(index + 1) * 0.08}s both` }}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : integration.id)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/30 transition-colors"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  integration.connected ? "bg-success/10" : "bg-muted"
                }`}>
                  <Icon className={`w-5 h-5 ${integration.connected ? "text-success" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{integration.name}</h3>
                    {integration.connected && (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-success/10 text-success">
                        {accounts.length} connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{integration.description}</p>
                  {accounts.length > 0 && (
                    <p className="text-xs text-success mt-0.5 truncate">
                      {accounts.join(", ")}
                    </p>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/50">
                  {/* Connected accounts list */}
                  {accounts.length > 0 && (
                    <div className="mt-4 mb-4">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wider">
                        Connected accounts
                      </h4>
                      <div className="space-y-2">
                        {accounts.map((email) => (
                          <div key={email} className="flex items-center justify-between gap-2 bg-muted/30 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <Check className="w-3.5 h-3.5 text-success shrink-0" />
                              <span className="text-sm text-foreground truncate">{email}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDisconnect(integration.id, email); }}
                              className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 flex items-center gap-1"
                            >
                              <Unplug className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2 mt-4">
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wider">
                        What {agentName} can do
                      </h4>
                      <div className="space-y-2">
                        {integration.capabilities.map((cap, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                            {cap}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wider">
                        Setup steps
                      </h4>
                      <div className="space-y-2">
                        {integration.setupSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => handleConnect(integration.id)}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                      {isConnecting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          {integration.connected ? <Plus className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                          {integration.connected ? "Add another account" : `Connect ${integration.name}`}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Slack Notifications */}
      <div
        className="glass-card rounded-2xl p-6 mt-6"
        style={{ animation: "fade-up 0.4s ease-out 0.5s both" }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Slack Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Get notified in Slack when {agentName} has updates for you.
            </p>
          </div>
        </div>
        <SlackChannelSelector />
      </div>
    </div>
  );
};
