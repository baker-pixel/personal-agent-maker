import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

export const useGoogleOAuthPopup = () => {
  // `connecting` holds the service id currently in-flight (e.g. "gmail" or
  // "google-calendar"), or null when idle. We expose it as the single source
  // of truth so the UI can disable sibling buttons until the flow settles.
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Hard guard: prevents starting a second OAuth flow while one is already
  // running. State updates are async so we cannot rely on `connecting` alone
  // to block back-to-back calls fired in the same tick.
  const inFlightRef = useRef(false);
  const { refreshConnections, integrations } = useIntegrations();
  const { toast } = useToast();

  // Keep a ref of integrations so the `connect` callback identity is stable
  // and doesn't get recreated mid-OAuth (which would orphan listeners).
  const integrationsRef = useRef(integrations);
  useEffect(() => {
    integrationsRef.current = integrations;
  }, [integrations]);

  // Ensure any in-flight listener/timer is torn down on unmount.
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  const connect = useCallback(async (service: string) => {
    // If another flow is still mid-air (popup open, awaiting callback), tear
    // it down deterministically before starting the new one. This prevents
    // the "Gmail → Calendar" sequence from getting stuck behind a stale
    // listener/loader and guarantees a fresh OAuth request every time.
    if (inFlightRef.current || cleanupRef.current) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      inFlightRef.current = false;
      setConnecting(null);
    }

    inFlightRef.current = true;
    setConnecting(service);

    try {
      // Always request a freshly-generated OAuth URL (new state param) — we
      // never reuse a cached URL across attempts or services.
      const response = await supabase.functions.invoke("google-auth", {
        body: { service, origin: window.location.origin },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (!url) throw new Error("No auth URL returned");

      const wasPreviouslyConnected = integrationsRef.current.find(i => i.id === service)?.connected;

      const w = 500, h = 650;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      // Unique window name per attempt so we never get a stale (already-
      // closed) window reference from a prior flow.
      const windowName = `google-oauth-${service}-${Date.now()}`;
      const popup = window.open(
        url,
        windowName,
        `width=${w},height=${h},left=${left},top=${top},popup=yes`
      );
      popupRef.current = popup;

      // If the browser blocked the popup, exit cleanly — never sit in a loader.
      if (!popup) {
        inFlightRef.current = false;
        setConnecting(null);
        toast({
          title: "Popup blocked",
          description: "Please allow popups for this site and try again.",
          variant: "destructive",
        });
        return;
      }

      const label = service === "gmail" ? "Gmail" : "Google Calendar";
      let completed = false;

      const teardown = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(closedPoll);
        clearTimeout(fallback);
        popupRef.current = null;
        cleanupRef.current = null;
      };

      const completeConnection = async (didSucceed: boolean) => {
        if (completed) return;
        completed = true;
        teardown();

        // ALWAYS re-fetch authoritative server state after a flow ends —
        // success OR failure. This is the "hard reset" that ensures the next
        // sibling connect (e.g. Calendar after Gmail) sees fresh integration
        // state instead of stale cached values.
        try {
          await refreshConnections();
        } catch (e) {
          console.warn("refreshConnections after OAuth failed:", e);
        } finally {
          // Clear flags LAST so the UI only re-enables the sibling button
          // after the re-fetch settles — preventing a race where Calendar
          // is clicked before Gmail's persisted token is reflected.
          inFlightRef.current = false;
          setConnecting(null);
        }

        if (didSucceed && !wasPreviouslyConnected) {
          toast({
            title: `${label} connected ✓`,
            description: `Your ${label} account is now linked and ready to use.`,
          });
        }
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.data?.type !== "normy-google-oauth-complete") return;
        void completeConnection(true);
      };

      // Poll for popup-closed: if the user closes the popup without
      // finishing OAuth, clear loading so they can retry / connect sibling.
      const closedPoll = window.setInterval(() => {
        if (popup && popup.closed) {
          void completeConnection(false);
        }
      }, 500);

      // Hard timeout fallback — if no message and popup never closes within
      // 2 minutes, exit the loader and allow retry.
      const fallback = window.setTimeout(() => void completeConnection(false), 120000);
      window.addEventListener("message", onMessage);

      // Expose teardown so a subsequent connect() call can cancel this one.
      cleanupRef.current = () => {
        if (!completed) {
          completed = true;
          teardown();
          inFlightRef.current = false;
          setConnecting(null);
        }
      };
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      inFlightRef.current = false;
      setConnecting(null);
      cleanupRef.current = null;
      throw error;
    }
  }, [refreshConnections, toast]);

  return { connecting, connect };
};
