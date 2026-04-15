import { useState, useEffect } from "react";
import { ArrowRight, ArrowLeft, Download, Share, PlusSquare, Smartphone, Check } from "lucide-react";

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type Platform = "ios" | "android" | "desktop";

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

export const OnboardingInstallPWA = ({ onNext, onBack, onSkip }: Props) => {
  const [platform] = useState<Platform>(getPlatform);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (installed) {
    return (
      <>
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
            <Check className="w-7 h-7 text-accent" />
          </div>
        </div>
        <div className="text-center mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">Already installed!</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Normy is on your home screen and ready to go.
          </p>
        </div>
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </>
    );
  }

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Smartphone className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">
          Add to Home Screen
        </h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Install Normy for instant, app-like access — no app store needed.
        </p>
      </div>

      <div className="space-y-3 mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        {platform === "ios" ? (
          <>
            <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest mb-3 text-center">
              How to install on iPhone / iPad
            </p>
            {[
              {
                step: "1",
                icon: <Share className="w-4 h-4 text-accent" />,
                text: (
                  <>
                    Tap the <span className="font-semibold text-foreground">Share</span> button in Safari's toolbar
                  </>
                ),
              },
              {
                step: "2",
                icon: <PlusSquare className="w-4 h-4 text-accent" />,
                text: (
                  <>
                    Scroll down and tap <span className="font-semibold text-foreground">"Add to Home Screen"</span>
                  </>
                ),
              },
              {
                step: "3",
                icon: <Check className="w-4 h-4 text-accent" />,
                text: (
                  <>
                    Tap <span className="font-semibold text-foreground">"Add"</span> in the top right
                  </>
                ),
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-center gap-3.5 bg-card/60 border border-border/20 rounded-xl px-4 py-3 text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </>
        ) : platform === "android" ? (
          <>
            <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest mb-3 text-center">
              How to install on Android
            </p>
            {deferredPrompt ? (
              <div className="text-center">
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Install Normy
                </button>
              </div>
            ) : (
              [
                { step: "1", text: "Tap the ⋮ menu in Chrome" },
                { step: "2", text: 'Tap "Add to Home screen"' },
                { step: "3", text: 'Tap "Add" to confirm' },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-center gap-3.5 bg-card/60 border border-border/20 rounded-xl px-4 py-3 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">
                    {item.step}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest mb-3 text-center">
              Install as a desktop app
            </p>
            {deferredPrompt ? (
              <div className="text-center">
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Install Normy
                </button>
              </div>
            ) : (
              <div className="bg-card/60 border border-border/20 rounded-xl px-4 py-3 text-left">
                <p className="text-sm text-muted-foreground">
                  Click the <Download className="inline w-3.5 h-3.5 -mt-0.5" /> install icon in your browser's address bar, or use the browser menu to "Install app".
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground/50 hover:text-muted-foreground py-1.5 px-2 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
};
