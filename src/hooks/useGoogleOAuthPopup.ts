import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const { refreshConnections } = useIntegrations();

  const connect = useCallback(async (service: string) => {
    setConnecting(service);
    try {
      const response = await supabase.functions.invoke("google-auth", {
        body: { service },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (!url) throw new Error("No auth URL returned");

      // Open in a centered popup
      const w = 500, h = 650;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url,
        "google-oauth",
        `width=${w},height=${h},left=${left},top=${top},popup=yes`
      );
      popupRef.current = popup;

      // Poll for popup close
      const poll = setInterval(async () => {
        if (!popup || popup.closed) {
          clearInterval(poll);
          popupRef.current = null;
          // Refresh connections from DB to pick up new token
          await refreshConnections();
          setConnecting(null);
        }
      }, 500);
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      setConnecting(null);
      throw error;
    }
  }, [refreshConnections]);

  return { connecting, connect };
};
