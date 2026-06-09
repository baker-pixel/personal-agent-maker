import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

/**
 * Detects when a new service worker is waiting and shows a persistent
 * "Update available" toast. User taps Refresh → SW activates → page reloads.
 */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, reg) {
      if (!reg) return;
      // Check immediately on registration (catches deploys that happened while app was closed)
      reg.update();
      // Re-check every 5 minutes for long-lived sessions
      setInterval(() => reg.update(), 5 * 60 * 1000);
      // Re-check when user returns to the tab after being away
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update();
      });
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("Update available", {
      description: "A new version of Normy is ready.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => updateServiceWorker(true),
      },
      icon: <RefreshCw className="w-4 h-4" />,
      id: "pwa-update",
    });
    return () => {
      toast.dismiss("pwa-update");
    };
  }, [needRefresh, updateServiceWorker]);

  return null;
}
