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
  /** True while the integration list is being re-fetched from the server. */
  refreshing: boolean;
  /** Error from the most recent token metadata fetch, if any. */
  tokensError: string | null;
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
  refreshing: false,
  tokensError: null,
});

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [integrations, setIntegrations] = useState<Integration[]>(defaultIntegrations);
  const [refreshing, setRefreshing] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  const fetchConnected = useCallback(async () => {
    setRefreshing(true);
    try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: tokens, error: tokensQueryError } = await supabase
      .from("google_oauth_token_metadata" as any)
      .select("provider, email") as { data: { provider: string; email: string | null }[] | null; error: { message: string } | null };

    if (tokensQueryError) {
      // Surface the error instead of silently swallowing it — the UI can now
      // show a meaningful message instead of pretending nothing is connected.
      console.error("Failed to load integration tokens metadata:", tokensQueryError);
      setTokensError(tokensQueryError.message ?? "Failed to load integrations");
      return;
    }
    setTokensError(null);

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
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial sync on mount / page load — guarantees the UI reflects the
    // server's authoritative integration state without any manual refresh.
    fetchConnected();

    // Re-sync on every relevant auth lifecycle event so OAuth completions
    // and re-hydrated sessions immediately flip integration status.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        fetchConnected();
      } else if (event === "SIGNED_OUT") {
        // Clear connected state immediately on sign-out so a subsequent
        // sign-in starts from a clean, unsynced UI before re-fetching.
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === "gmail" || i.id === "google-calendar"
              ? { ...i, connected: false, connectedAccounts: [] }
              : i
          )
        );
      }
    });

    // Re-sync whenever the tab regains focus or becomes visible — covers the
    // case where an OAuth popup completes in another window/tab, or the user
    // returns to the app after a disconnect elsewhere.
    const onFocus = () => { fetchConnected(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchConnected();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
    // Each service now owns its own refresh token (no cross-service sibling
    // sync), so disconnecting Gmail must NOT cascade to Calendar and vice
    // versa. Only target the requested provider row.
    const providersToRemove = [provider];

    // 0. Optimistic UI: drop the email from the affected provider only.
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== provider) return i;
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

    // 2. Delete only the (provider, email) row (RLS scopes to user).
    await supabase
      .from("google_oauth_tokens")
      .delete()
      .eq("provider", provider)
      .eq("email", email);

    // 3. Clear any local cache tied to this provider only.
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
    <IntegrationsContext.Provider value={{ integrations, toggleConnection, isConnected, refreshConnections: fetchConnected, removeAccount, refreshing, tokensError }}>
      {children}
    </IntegrationsContext.Provider>
  );
};
