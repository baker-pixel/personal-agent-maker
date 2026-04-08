import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  connectedAccounts: string[];
  capabilities: string[];
  setupSteps: string[];
}

interface IntegrationsContextType {
  integrations: Integration[];
  toggleConnection: (id: string) => void;
  isConnected: (id: string) => boolean;
  refreshConnections: () => Promise<void>;
  removeAccount: (provider: string, email: string) => Promise<void>;
}

const defaultIntegrations: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, categorize, and draft email replies. Triage your inbox automatically.",
    icon: "mail",
    connected: false,
    connectedAccounts: [],
    capabilities: [
      "Read and categorize incoming emails",
      "Draft replies for your approval",
      "Flag urgent messages",
      "Auto-archive low-priority emails",
      "Track follow-ups and responses",
    ],
    setupSteps: [
      "Click Connect to sign in with your Google account",
      "Grant read and compose permissions",
      "Choose which labels to monitor",
      "Set triage preferences (urgency rules, VIP senders)",
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage scheduling, detect conflicts, and optimize your calendar.",
    icon: "calendar",
    connected: false,
    connectedAccounts: [],
    capabilities: [
      "Detect and resolve scheduling conflicts",
      "Suggest optimal meeting times",
      "Auto-decline low-priority meetings",
      "Block focus time based on workload",
      "Prepare meeting briefs with context",
    ],
    setupSteps: [
      "Click Connect to sign in with your Google account",
      "Grant calendar read and write permissions",
      "Select calendars to manage",
      "Set working hours and meeting preferences",
    ],
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    description: "Full email and calendar management through Microsoft 365.",
    icon: "mail",
    connected: false,
    connectedAccounts: [],
    capabilities: [
      "Email triage and draft responses",
      "Calendar conflict resolution",
      "Meeting preparation and follow-ups",
      "Task syncing with Microsoft To Do",
    ],
    setupSteps: [
      "Click Connect to sign in with Microsoft",
      "Grant mail and calendar permissions",
      "Choose folders and calendars to manage",
      "Configure priority rules",
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Monitor channels, surface action items, and draft responses.",
    icon: "message",
    connected: false,
    connectedAccounts: [],
    capabilities: [
      "Surface messages that need your response",
      "Summarize channel activity",
      "Draft thread replies",
      "Track action items from conversations",
    ],
    setupSteps: [
      "Click Connect to authorize your Slack workspace",
      "Select channels to monitor",
      "Set notification preferences",
    ],
  },
];

const IntegrationsContext = createContext<IntegrationsContextType>({
  integrations: defaultIntegrations,
  toggleConnection: () => {},
  isConnected: () => false,
  refreshConnections: async () => {},
  removeAccount: async () => {},
});

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [integrations, setIntegrations] = useState<Integration[]>(defaultIntegrations);

  const fetchConnected = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: tokens } = await supabase
      .from("google_oauth_token_metadata" as any)
      .select("provider, email") as { data: { provider: string; email: string | null }[] | null };

    if (tokens && tokens.length > 0) {
      // Group emails by provider
      const providerEmails = new Map<string, string[]>();
      for (const t of tokens) {
        const emails = providerEmails.get(t.provider) || [];
        if (t.email && !emails.includes(t.email)) emails.push(t.email);
        providerEmails.set(t.provider, emails);
      }

      setIntegrations((prev) =>
        prev.map((i) => {
          const emails = providerEmails.get(i.id) || [];
          return {
            ...i,
            connected: emails.length > 0,
            connectedAccounts: emails,
          };
        })
      );
    }
  }, []);

  useEffect(() => {
    fetchConnected();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        fetchConnected();
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchConnected]);

  const toggleConnection = useCallback((id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const nowConnected = !i.connected;
        return {
          ...i,
          connected: nowConnected,
          connectedAccounts: nowConnected ? i.connectedAccounts : [],
        };
      })
    );
  }, []);

  const removeAccount = useCallback(async (provider: string, email: string) => {
    const { error } = await supabase
      .from("google_oauth_tokens")
      .delete()
      .eq("provider", provider)
      .eq("email", email);
    if (!error) {
      await fetchConnected();
    }
  }, [fetchConnected]);

  const isConnected = useCallback(
    (id: string) => integrations.find((i) => i.id === id)?.connected ?? false,
    [integrations]
  );

  return (
    <IntegrationsContext.Provider value={{ integrations, toggleConnection, isConnected, refreshConnections: fetchConnected, removeAccount }}>
      {children}
    </IntegrationsContext.Provider>
  );
};
