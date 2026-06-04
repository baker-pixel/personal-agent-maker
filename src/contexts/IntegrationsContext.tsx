// @ts-nocheck
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
  /** True until the very first fetchConnected completes — prevents flash of "not connected". */
  integrationsLoading: boolean;
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
  integrationsLoading: true,
  tokensError: null,
});

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [integrations, setIntegrations] = useState<Integration[]>(defaultIntegrations);
  const [refreshing, setRefreshing] = useState(false);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);

  const fetchConnected = useCallback(async () => {
    setRefreshing(true);
    try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: grants, error: grantsQueryError } = await supabase
      .from("nylas_grants")
      .select("email, provider");

    if (grantsQueryError) {
      console.error("Failed to load nylas_grants:", grantsQueryError);
      setTokensError(grantsQueryError.message ?? "Failed to load integrations");
      return;
    }
    setTokensError(null);

    // One Nylas Google grant covers both Gmail and Calendar.
    // Collect unique emails from google grants and apply to both services.
    const googleEmails: string[] = [];
    for (const g of grants ?? []) {
      if (g.provider === "google" && g.email && !googleEmails.includes(g.email)) {
        googleEmails.push(g.email);
      }
    }

    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== "gmail" && i.id !== "google-calendar") return i;
        return {
          ...i,
          connected: googleEmails.length > 0,
          connectedAccounts: googleEmails,
        };
      })
    );
    } finally {
      setRefreshing(false);
      setIntegrationsLoading(false);
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
    // Debounced to avoid rapid consecutive fetches on quick tab switches.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchConnected(), 500);
    };
    const onFocus = () => { debouncedFetch(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") debouncedFetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceTimer) clearTimeout(debounceTimer);
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

  const removeAccount = useCallback(async (_provider: string, email: string) => {
    // Optimistic UI: one Nylas Google grant covers both Gmail and Calendar.
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== "gmail" && i.id !== "google-calendar") return i;
        const remaining = i.connectedAccounts.filter((e) => e !== email);
        return { ...i, connected: remaining.length > 0, connectedAccounts: remaining };
      })
    );

    // Revoke the Nylas grant (handles DB deletion + email data purge internally).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.functions.invoke("nylas-revoke", {
          body: { provider: "google", email },
        });
      }
    } catch (err) {
      console.warn("Nylas revoke failed (continuing):", err);
    }

    // Clear client-side email caches so no stale data survives reconnect.
    try { localStorage.removeItem("normy_archived_emails"); } catch { /* ignore */ }

    // Re-sync from server so state is authoritative.
    await fetchConnected();
  }, [fetchConnected]);

  const isConnected = useCallback(
    (id: string) => integrations.find((i) => i.id === id)?.connected ?? false,
    [integrations]
  );

  return (
    <IntegrationsContext.Provider value={{ integrations, toggleConnection, isConnected, refreshConnections: fetchConnected, removeAccount, refreshing, integrationsLoading, tokensError }}>
      {children}
    </IntegrationsContext.Provider>
  );
};