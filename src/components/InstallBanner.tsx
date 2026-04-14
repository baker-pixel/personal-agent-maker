import { useState, useEffect } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Platform = "ios" | "android" | "desktop" | null;

function getPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

const DISMISSED_KEY = "normy_install_banner_dismissed";

export default function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const plat = getPlatform();
    setPlatform(plat);

    if (plat === "android" || plat === "desktop") {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", handler);

      // Also show on iOS where beforeinstallprompt doesn't fire
      if (plat !== "android") {
        const timer = setTimeout(() => setVisible(true), 3000);
        return () => {
          clearTimeout(timer);
          window.removeEventListener("beforeinstallprompt", handler);
        };
      }

      return () => window.removeEventListener("beforeinstallprompt", handler);
    }

    // iOS — show after short delay
    if (plat === "ios") {
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") dismiss();
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <img src="/icon-192-v2.png" alt="Normy" className="w-8 h-8 rounded-lg" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">Add Normy to Home Screen</h3>

            {platform === "ios" ? (
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" /> then{" "}
                <span className="font-medium text-foreground">"Add to Home Screen"</span>{" "}
                <PlusSquare className="inline w-3.5 h-3.5 -mt-0.5" /> for instant access.
              </p>
            ) : deferredPrompt ? (
              <div className="mt-2">
                <Button size="sm" onClick={handleInstall} className="h-8 text-xs rounded-lg">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Install Normy
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Use your browser menu to install Normy for quick access anytime.
              </p>
            )}
          </div>

          <button
            onClick={dismiss}
            className="flex-shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
