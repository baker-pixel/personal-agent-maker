import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  accountLabel?: string;
  capabilities: string[];
  setupSteps: string[];
}

interface IntegrationsContextType {
  integrations: Integration[];
  toggleConnection: (id: string) => void;
  isConnected: (id: string) => boolean;
}

const defaultIntegrations: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, categorize, and draft email replies. Triage your inbox automatically.",
    icon: "mail",
    connected: false,
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
});

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [integrations, setIntegrations] = useState<Integration[]>(defaultIntegrations);

  // Fetch connected integrations from the database on mount
  useEffect(() => {
    const fetchConnected = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: tokens } = await supabase
        .from("google_oauth_tokens")
        .select("provider, email");

      if (tokens && tokens.length > 0) {
        const tokenMap = new Map(tokens.map((t) => [t.provider, t.email]));
        setIntegrations((prev) =>
          prev.map((i) => ({
            ...i,
            connected: tokenMap.has(i.id) || i.connected,
            accountLabel: tokenMap.get(i.id) ?? i.accountLabel,
          }))
        );
      }
    };
    fetchConnected();
  }, []);

  const toggleConnection = useCallback((id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const nowConnected = !i.connected;
        return {
          ...i,
          connected: nowConnected,
          accountLabel: nowConnected ? i.accountLabel : undefined,
        };
      })
    );
  }, []);

  const isConnected = useCallback(
    (id: string) => integrations.find((i) => i.id === id)?.connected ?? false,
    [integrations]
  );

  return (
    <IntegrationsContext.Provider value={{ integrations, toggleConnection, isConnected }}>
      {children}
    </IntegrationsContext.Provider>
  );
};
