import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

// Architecture: backend is sole authority for "connected".
//
// Success path:
//   GoogleCallback (popup) → nylas-callback (edge fn) → grant stored in DB
//   → BC hint { type: "normy-oauth-hint" } → parent calls popup.close()
//   → closedPoll fires → refreshConnections() reads DB → toast if connected
//
// Cancel path:
//   User closes popup → closedPoll fires → no hint received → clear state, no refresh
//
// Error path:
//   GoogleCallback sends hint { error: "..." } → parent closes popup
//   → closedPoll fires → show error toast, no refresh needed

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef   = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const { refreshConnections, integrations } = useIntegrations();
  const { toast } = useToast();

  const integrationsRef = useRef(integrations);
  useEffect(() => { integrationsRef.current = integrations; }, [integrations]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      inFlightRef.current = null;
    };
  }, []);

  const connect = useCallback(async (service: string) => {
    if (inFlightRef.current || cleanupRef.current) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      inFlightRef.current = null;
      setConnecting(null);
    }

    inFlightRef.current = service;
    setConnecting(service);

    try {
      const response = await supabase.functions.invoke("nylas-auth", {
        body: { service, origin: window.location.origin, isPopupFlow: true },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (!url) throw new Error("No auth URL returned");

      const wasPreviouslyConnected =
        integrationsRef.current.find(i => i.id === service)?.connected ?? false;
      const label = service === "gmail" ? "Gmail" : "Google Calendar";

      const w = 500, h = 650;
      const left = window.screenX + (window.outerWidth  - w) / 2;
      const top  = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url,
        `google-oauth-${service}-${Date.now()}`,
        `width=${w},height=${h},left=${left},top=${top},popup=yes`
      );
      popupRef.current = popup;

      if (!popup) {
        // Popup blocked — fall back to full-page redirect
        inFlightRef.current = null;
        setConnecting(null);
        sessionStorage.setItem(
          "oauth-return-to",
          window.location.pathname + window.location.search
        );
        window.location.href = url;
        return;
      }

      let hintReceived = false;
      let hintError: string | null = null;
      let done = false;

      const teardown = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(closedPoll);
        clearTimeout(fallback);
        try { bc.close(); } catch {}
        popupRef.current  = null;
        cleanupRef.current = null;
      };

      const finish = async () => {
        if (done) return;
        done = true;
        teardown();

        if (!hintReceived) {
          // User cancelled — no state change in DB
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
          return;
        }

        if (hintError) {
          toast({ title: "Connection failed", description: hintError, variant: "destructive" });
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
          return;
        }

        // Backend confirmed success (hint, no error) → DB is truth
        try {
          const result = await refreshConnections(); // single call
          if (!wasPreviouslyConnected && result?.googleConnected) {
            toast({
              title: `${label} connected ✓`,
              description: `Your ${label} account is now linked and ready to use.`,
            });
            if (service === "gmail") {
              supabase.functions.invoke("email-triage",   { body: {} }).catch(() => {});
              supabase.functions.invoke("contacts-sync",  { body: {} }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn("refreshConnections after OAuth failed:", e);
        } finally {
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
        }
      };

      // ── BroadcastChannel — hint/transport only ──────────────────────────
      // GoogleCallback sends { type: "normy-oauth-hint", error?: string } after
      // calling nylas-callback. This is NOT a success signal — it's a cue for
      // the parent to close the popup and then read the DB via refreshConnections.
      const bc = new BroadcastChannel("normy-oauth");
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== "normy-oauth-hint") return;
        hintReceived = true;
        hintError = event.data?.error ?? null;
        // Parent closes popup — reliable even after COOP navigation severs opener
        try { popup.close(); } catch {}
      };

      // postMessage fallback when window.opener is still intact
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "normy-oauth-hint") return;
        hintReceived = true;
        hintError = event.data?.error ?? null;
        try { popup.close(); } catch {}
      };
      window.addEventListener("message", onMessage);

      // ── Closed poll ─────────────────────────────────────────────────────
      // Triggers finish() once popup.closed is true (covers both: parent-closed
      // after hint, and user-manually-closed without hint).
      const closedPoll = window.setInterval(() => {
        if (!popup.closed) return;
        clearInterval(closedPoll);
        void finish();
      }, 300);

      // Safety net: force cleanup after 120s regardless
      const fallback = window.setTimeout(() => {
        try { popup.close(); } catch {}
        void finish();
      }, 120_000);

      cleanupRef.current = () => {
        if (!done) {
          done = true;
          teardown();
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
        }
      };
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
      cleanupRef.current = null;
      throw error;
    }
  }, [refreshConnections, toast]);

  return { connecting, connect };
};
