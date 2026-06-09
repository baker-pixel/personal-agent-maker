// @ts-nocheck
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/contexts/AppStateContext";

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
  refreshConnections: () => Promise<{
    gmailConnected: boolean;
    calendarConnected: boolean;
  }>;
  removeAccount: (provider: string, email: string) => Promise<void>;
  refreshing: boolean;
  integrationsLoading: boolean;
  tokensError: string | null;
}

const BASE_INTEGRATIONS: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    description:
      "Read, categorize, and draft email replies. Triage your inbox automatically.",
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
    description:
      "Manage scheduling, detect conflicts, and optimize your calendar.",
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
    description:
      "Monitor channels, surface action items, and draft responses.",
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
  integrations: BASE_INTEGRATIONS,
  toggleConnection: () => {},
  isConnected: () => false,
  refreshConnections: async () => ({
    gmailConnected: false,
    calendarConnected: false,
  }),
  removeAccount: async () => {},
  refreshing: false,
  integrationsLoading: true,
  tokensError: null,
});

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { state, fetchIntegrations } = useAppState();
  const [refreshing, setRefreshing] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);

  // integrationsLoading is true until we have our first data from the machine.
  // Machine starts with HYDRATING; once it transitions out, profile+integrations are set.
  const integrationsLoading = state.phase === "BOOTING" || state.phase === "HYDRATING";

  // Map machine integration state onto the full Integration[] shape expected by consumers.
  const integrations = useMemo<Integration[]>(() => {
    const { gmailConnected, connectedEmails } = state.integrations;
    return BASE_INTEGRATIONS.map((i) => {
      if (i.id === "gmail" || i.id === "google-calendar") {
        return {
          ...i,
          connected: gmailConnected,
          connectedAccounts: connectedEmails,
        };
      }
      return i;
    });
  }, [state.integrations]);

  // Wrap fetchIntegrations so callsites get the legacy return shape.
  const refreshConnections = useCallback(async () => {
    setRefreshing(true);
    setTokensError(null);
    try {
      const result = await fetchIntegrations();
      return {
        gmailConnected: result.gmailConnected,
        calendarConnected: result.calendarConnected,
      };
    } catch (err: any) {
      setTokensError(err?.message ?? "Failed to load integrations");
      return { gmailConnected: false, calendarConnected: false };
    } finally {
      setRefreshing(false);
    }
  }, [fetchIntegrations]);

  // Re-sync on tab focus / visibility — eventual consistency for OAuth completions.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshConnections(), 500);
    };
    const onFocus = () => debounced();
    const onVisibility = () => {
      if (document.visibilityState === "visible") debounced();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [refreshConnections]);

  const toggleConnection = useCallback((id: string) => {
    // Kept for backward compat — real state lives in the machine.
    // UI-only optimistic toggle; machine state will overwrite on next refresh.
  }, []);

  const removeAccount = useCallback(
    async (_provider: string, email: string) => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await supabase.functions.invoke("nylas-revoke", {
            body: { provider: "google", email },
          });
        }
      } catch (err) {
        console.warn("Nylas revoke failed (continuing):", err);
      }

      try {
        localStorage.removeItem("normy_archived_emails");
      } catch {}

      await refreshConnections();
    },
    [refreshConnections]
  );

  const isConnected = useCallback(
    (id: string) => integrations.find((i) => i.id === id)?.connected ?? false,
    [integrations]
  );

  return (
    <IntegrationsContext.Provider
      value={{
        integrations,
        toggleConnection,
        isConnected,
        refreshConnections,
        removeAccount,
        refreshing,
        integrationsLoading,
        tokensError,
      }}
    >
      {children}
    </IntegrationsContext.Provider>
  );
};
