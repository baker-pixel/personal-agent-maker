import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

// Architecture: DB poll is the only success signal.
//
//   1. Open popup (or full-page redirect if blocked)
//   2. Popup independently calls nylas-callback → grant stored in DB
//   3. Parent polls refreshConnections() every 1s until grant appears
//   4. Show result based on what DB actually says — no popup/event dependency

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 15; // 15s max wait

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const { refreshConnections } = useIntegrations();
  const { toast } = useToast();

  const connect = useCallback(async (service: string) => {
    if (inFlightRef.current) return; // prevent concurrent flows
    inFlightRef.current = service;
    setConnecting(service);

    try {
      // ── 1. Get OAuth URL ───────────────────────────────────────────────
      const { data, error } = await supabase.functions.invoke("nylas-auth", {
        body: { service, origin: window.location.origin, isPopupFlow: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No auth URL returned");

      const label = service === "gmail" ? "Gmail" : "Google Calendar";

      // ── 2. Open popup ──────────────────────────────────────────────────
      const popup = window.open(
        data.url,
        `normy-oauth-${service}`,
        "width=500,height=650,popup=yes"
      );

      if (!popup) {
        // Popup blocked — fetch a redirect-safe URL (no |popup in state)
        // so GoogleCallback handles it as full-page mode.
        const { data: fp } = await supabase.functions.invoke("nylas-auth", {
          body: { service, origin: window.location.origin, isPopupFlow: false },
        });
        sessionStorage.setItem(
          "oauth-return-to",
          window.location.pathname + window.location.search
        );
        window.location.href = fp?.url ?? data.url;
        return; // finally still clears state
      }

      // ── 3. Poll DB until grant appears ─────────────────────────────────
      // Popup independently calls nylas-callback and stores the grant.
      // We don't care HOW or WHEN — we just wait for the DB to confirm.
      let connected = false;
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        await new Promise<void>(r => setTimeout(r, POLL_INTERVAL_MS));
        const res = await refreshConnections();
        const isNowConnected =
          service === "gmail" ? res?.gmailConnected : res?.calendarConnected;
        if (isNowConnected) { connected = true; break; }
      }

      // ── 4. Best-effort popup close ─────────────────────────────────────
      try { popup.close(); } catch {}

      // ── 5. Result ──────────────────────────────────────────────────────
      if (connected) {
        toast({
          title: `${label} connected ✓`,
          description: `Your ${label} account is now linked and ready to use.`,
        });
        if (service === "gmail") {
          supabase.functions.invoke("email-triage",  { body: {} }).catch(() => {});
          supabase.functions.invoke("contacts-sync", { body: {} }).catch(() => {});
        }
      } else {
        toast({
          title: "Timed out waiting for connection",
          description: "The tab may still be open — wait a moment then try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      toast({
        title: "Connection failed",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      inFlightRef.current = null;
      setConnecting(null);
    }
  }, [refreshConnections, toast]);

  return { connecting, connect };
};
