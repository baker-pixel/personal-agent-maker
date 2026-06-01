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
      // Poll for updates every hour so long-lived sessions catch deploys.
      if (reg) {
        setInterval(() => reg.update(), 60 * 60 * 1000);
      }
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

    return () => toast.dismiss("pwa-update");
  }, [needRefresh, updateServiceWorker]);

  return null;
}
