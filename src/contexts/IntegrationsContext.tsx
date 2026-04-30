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

    // Group emails by provider (empty map if no tokens — this is what clears stale state).
    const providerEmails = new Map<string, string[]>();
    for (const t of tokens ?? []) {
      const emails = providerEmails.get(t.provider) || [];
      if (t.email && !emails.includes(t.email)) emails.push(t.email);
      providerEmails.set(t.provider, emails);
    }

    // Always re-derive connected state for every Google provider so that
    // a disconnect (which removes the row) reliably flips connected → false.
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== "gmail" && i.id !== "google-calendar") return i;
        const emails = providerEmails.get(i.id) || [];
        return {
          ...i,
          connected: emails.length > 0,
          connectedAccounts: emails,
        };
      })
    );
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
    // Gmail and Google Calendar share the same underlying Google account/refresh
    // token. Revoking either one invalidates BOTH at Google, so we must delete
    // both rows locally — otherwise the sibling row keeps the UI showing the
    // account as still connected after refresh.
    const googleProviders = ["gmail", "google-calendar"];
    const providersToRemove = googleProviders.includes(provider) ? googleProviders : [provider];

    // 0. Optimistic UI: drop the email from every affected provider immediately.
    setIntegrations((prev) =>
      prev.map((i) => {
        if (!providersToRemove.includes(i.id)) return i;
        const remaining = i.connectedAccounts.filter((e) => e !== email);
        return { ...i, connected: remaining.length > 0, connectedAccounts: remaining };
      })
    );

    // 1. Best-effort: revoke token directly with Google before deleting our row.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.functions.invoke("google-revoke", {
          body: { provider, email },
        });
      }
    } catch (err) {
      console.warn("Google token revoke failed (continuing with local delete):", err);
    }

    // 2. Delete stored rows for every affected provider (RLS scopes to user).
    await supabase
      .from("google_oauth_tokens")
      .delete()
      .in("provider", providersToRemove)
      .eq("email", email);

    // 3. Clear any local cache tied to these providers.
    try {
      const saved = localStorage.getItem("integrations-state");
      if (saved) {
        const ids: string[] = JSON.parse(saved);
        const next = ids.filter((id) => !providersToRemove.includes(id));
        localStorage.setItem("integrations-state", JSON.stringify(next));
      }
    } catch {}

    // 4. Re-sync from the server so state is authoritative (runs even if delete failed).
    await fetchConnected();
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
