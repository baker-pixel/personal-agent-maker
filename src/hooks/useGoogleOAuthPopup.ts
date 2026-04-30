import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
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
    };
  }, []);

  const connect = useCallback(async (service: string) => {
    // If a previous OAuth attempt is still "in-flight" (e.g. user closed the
    // popup without completing, or switched providers), tear it down so the
    // new flow doesn't get stuck behind a stale listener / loader.
    cleanupRef.current?.();
    cleanupRef.current = null;

    setConnecting(service);
    try {
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
      // Use a unique window name per attempt so we never get a stale (already-
      // closed) reference from a prior OAuth flow (e.g. Gmail → Calendar in sequence).
      const windowName = `google-oauth-${service}-${Date.now()}`;
      const popup = window.open(
        url,
        windowName,
        `width=${w},height=${h},left=${left},top=${top},popup=yes`
      );
      popupRef.current = popup;

      // If the browser blocked the popup entirely, bail out cleanly instead of
      // sitting in an infinite loader.
      if (!popup) {
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
      let succeeded = false;

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
        succeeded = didSucceed;
        teardown();
        try {
          await refreshConnections();
        } catch (e) {
          console.warn("refreshConnections after OAuth failed:", e);
        } finally {
          setConnecting(null);
        }

        if (succeeded && !wasPreviouslyConnected) {
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

      // Poll for popup-closed: if the user closes the popup without finishing
      // OAuth, we need to clear the loading state so they can retry / connect
      // the sibling provider.
      const closedPoll = window.setInterval(() => {
        if (popup && popup.closed) {
          void completeConnection(false);
        }
      }, 500);

      const fallback = window.setTimeout(() => void completeConnection(false), 120000);
      window.addEventListener("message", onMessage);

      // Expose teardown so a subsequent connect() call can cancel this one.
      cleanupRef.current = () => {
        if (!completed) {
          completed = true;
          teardown();
          setConnecting(null);
        }
      };
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      setConnecting(null);
      cleanupRef.current = null;
      throw error;
    }
  }, [refreshConnections, toast]);

  return { connecting, connect };
};
