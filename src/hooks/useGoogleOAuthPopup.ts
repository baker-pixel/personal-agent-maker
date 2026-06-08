import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";
import { reloadAfterIntegrationChange } from "@/lib/integrationReload";

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const { refreshConnections, integrations } = useIntegrations();
  const { toast } = useToast();

  const integrationsRef = useRef(integrations);
  useEffect(() => {
    integrationsRef.current = integrations;
  }, [integrations]);

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
      // isPopupFlow=true causes nylas-auth to encode "|popup" in the OAuth state
      // param. GoogleCallback reads this to detect popup mode even after COOP
      // headers from Google sever window.opener.
      const response = await supabase.functions.invoke("nylas-auth", {
        body: { service, origin: window.location.origin, isPopupFlow: true },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (!url) throw new Error("No auth URL returned");

      const wasPreviouslyConnected = integrationsRef.current.find(i => i.id === service)?.connected;

      const w = 500, h = 650;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const windowName = `google-oauth-${service}-${Date.now()}`;
      const popup = window.open(
        url,
        windowName,
        `width=${w},height=${h},left=${left},top=${top},popup=yes`
      );
      popupRef.current = popup;

      if (!popup) {
        // Popup fully blocked — fall back to full-page redirect.
        inFlightRef.current = null;
        setConnecting(null);
        sessionStorage.setItem("oauth-return-to", window.location.pathname + window.location.search);
        window.location.href = url;
        return;
      }

      const label = service === "gmail" ? "Gmail" : "Google Calendar";
      let completed = false;

      const teardown = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(closedPoll);
        clearTimeout(fallback);
        try { bc.close(); } catch {}
        popupRef.current = null;
        cleanupRef.current = null;
      };

      const completeConnection = async (didSucceed: boolean) => {
        if (completed) return;
        completed = true;
        teardown();

        try {
          await refreshConnections();
        } catch (e) {
          console.warn("refreshConnections after OAuth failed:", e);
        } finally {
          if (inFlightRef.current === service) {
            inFlightRef.current = null;
            setConnecting(null);
          }
        }

        if (didSucceed && !wasPreviouslyConnected) {
          toast({
            title: `${label} connected ✓`,
            description: `Your ${label} account is now linked and ready to use.`,
          });
        }

        if (didSucceed) {
          reloadAfterIntegrationChange();
          if (service === "gmail") {
            supabase.functions.invoke("email-triage", { body: {} }).catch(() => {});
            supabase.functions.invoke("contacts-sync", { body: {} }).catch(() => {});
          }
        }
      };

      // Legacy postMessage listener (works when window.opener is intact)
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.data?.type !== "normy-google-oauth-complete") return;
        const succeeded = event.data?.success !== false;
        if (!succeeded && event.data?.error) {
          toast({ title: "Connection failed", description: String(event.data.error), variant: "destructive" });
        }
        void completeConnection(succeeded);
      };

      // BroadcastChannel listener — works even when COOP headers sever window.opener
      const bc = new BroadcastChannel("normy-oauth");
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== "normy-google-oauth-complete") return;
        const succeeded = event.data?.success !== false;
        if (!succeeded && event.data?.error) {
          toast({ title: "Connection failed", description: String(event.data.error), variant: "destructive" });
        }
        void completeConnection(succeeded);
      };

      const closedPoll = window.setInterval(() => {
        if (popup && popup.closed) void completeConnection(false);
      }, 500);

      const fallback = window.setTimeout(() => void completeConnection(false), 120000);
      window.addEventListener("message", onMessage);

      cleanupRef.current = () => {
        if (!completed) {
          completed = true;
          teardown();
          if (inFlightRef.current === service) {
            inFlightRef.current = null;
            setConnecting(null);
          }
        }
      };
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      if (inFlightRef.current === service) {
        inFlightRef.current = null;
        setConnecting(null);
      }
      cleanupRef.current = null;
      throw error;
    }
  }, [refreshConnections, toast]);

  return { connecting, connect };
};
