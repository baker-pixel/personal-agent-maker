import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useToast } from "@/hooks/use-toast";

export const useGoogleOAuthPopup = () => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const { refreshConnections, integrations } = useIntegrations();
  const { toast } = useToast();

  const connect = useCallback(async (service: string) => {
    setConnecting(service);
    try {
      const response = await supabase.functions.invoke("google-auth", {
        body: { service, origin: window.location.origin },
      });
      if (response.error) throw response.error;
      const { url } = response.data;
      if (!url) throw new Error("No auth URL returned");

      // Snapshot current connection state to detect new connections
      const wasPreviouslyConnected = integrations.find(i => i.id === service)?.connected;

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

      const label = service === "gmail" ? "Gmail" : "Google Calendar";

      const completeConnection = async () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(fallback);
        popupRef.current = null;
        await refreshConnections();
        setConnecting(null);

        if (!wasPreviouslyConnected) {
          toast({
            title: `${label} connected ✓`,
            description: `Your ${label} account is now linked and ready to use.`,
          });
        }
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.data?.type !== "normy-google-oauth-complete") return;
        void completeConnection();
      };

      window.addEventListener("message", onMessage);
      const fallback = window.setTimeout(() => void completeConnection(), 120000);
    } catch (error) {
      console.error("Google OAuth popup error:", error);
      setConnecting(null);
      throw error;
    }
  }, [refreshConnections, integrations, toast]);

  return { connecting, connect };
};
