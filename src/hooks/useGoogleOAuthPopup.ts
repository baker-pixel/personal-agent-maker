import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

// Architecture: backend is sole authority for "connected".
//
// Success path:
//   GoogleCallback → nylas-callback (backend, stores grant) → BC hint
//   → BC onmessage fires finish() directly (no polling)
//   → refreshConnections reads DB → toast if DB confirms connected
//
// Cancel path (user closes popup without OAuth):
//   window.focus event fires when popup closes → popup.closed check → finish()
//
// Single channel: BroadcastChannel only. postMessage removed.

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef    = useRef<Window | null>(null);
  const cleanupRef  = useRef<(() => void) | null>(null);
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

      // Accumulate cleanup fns so teardown has no forward-reference issues
      const cleanups: Array<() => void> = [];
      const teardown = () => {
        cleanups.forEach(fn => fn());
        cleanups.length = 0;
        popupRef.current  = null;
        cleanupRef.current = null;
      };

      const finish = async () => {
        if (done) return;
        done = true;
        teardown();

        if (!hintReceived) {
          // User closed popup without completing OAuth — DB unchanged
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
          return;
        }

        if (hintError) {
          toast({ title: "Connection failed", description: hintError, variant: "destructive" });
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
          return;
        }

        // Backend ack received, no error — read DB as sole truth
        try {
          const result = await refreshConnections(); // single call per connection
          if (!wasPreviouslyConnected && result?.googleConnected) {
            toast({
              title: `${label} connected ✓`,
              description: `Your ${label} account is now linked and ready to use.`,
            });
            if (service === "gmail") {
              supabase.functions.invoke("email-triage",  { body: {} }).catch(() => {});
              supabase.functions.invoke("contacts-sync", { body: {} }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn("refreshConnections after OAuth failed:", e);
        } finally {
          if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
        }
      };

      // ── BroadcastChannel — single channel, explicit callback ack ────────
      // GoogleCallback (popup) sends { type: "normy-oauth-hint", error? }
      // after nylas-callback resolves. Receipt IS the ack — finish() runs
      // immediately, no closed-state polling required.
      const bc = new BroadcastChannel("normy-oauth");
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== "normy-oauth-hint") return;
        hintReceived = true;
        hintError = event.data?.error ?? null;
        try { popup.close(); } catch {} // parent owns popup close
        void finish();
      };
      cleanups.push(() => { try { bc.close(); } catch {} });

      // ── Cancel detection: window focus event, no polling ────────────────
      // When the user closes the popup themselves (no ack), the parent window
      // regains focus. Check popup.closed then to detect the cancel.
      const onParentFocus = () => { if (!done && popup.closed) void finish(); };
      window.addEventListener("focus", onParentFocus);
      cleanups.push(() => window.removeEventListener("focus", onParentFocus));

      // Safety net: 120s hard timeout covers the case where the user closes
      // the popup but never focuses the main window (switches to another app).
      const fallback = window.setTimeout(() => {
        try { popup.close(); } catch {}
        void finish();
      }, 120_000);
      cleanups.push(() => clearTimeout(fallback));

      cleanupRef.current = () => {
        if (!done) { done = true; teardown(); }
        if (inFlightRef.current === service) { inFlightRef.current = null; setConnecting(null); }
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
