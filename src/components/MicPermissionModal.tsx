import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onRequest: () => void;       // user tapped "Enable Microphone" — call getUserMedia
  onDismiss: () => void;       // user tapped Skip / close
  denied?: boolean;            // true when permission was already denied
}

export function MicPermissionModal({ open, onRequest, onDismiss, denied = false }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={onDismiss}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-[91] bg-background rounded-t-3xl px-6 pb-10 pt-5 shadow-2xl"
            style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-5 w-10 h-1 rounded-full bg-muted-foreground/25" />

            {/* Close */}
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div
              className="mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
            >
              <Mic className="w-8 h-8 text-white" />
            </div>

            {denied ? (
              <>
                <h2 className="text-center text-xl font-bold text-foreground mb-2">
                  Microphone blocked
                </h2>
                <p className="text-center text-sm text-muted-foreground mb-6 leading-relaxed">
                  Microphone access was denied. To enable it in Safari:
                </p>
                <ol className="text-sm text-foreground space-y-3 mb-8 pl-1">
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center justify-center">1</span>
                    <span>Tap <strong>AA</strong> (or the lock icon) in the Safari address bar</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center justify-center">2</span>
                    <span>Tap <strong>Website Settings</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center justify-center">3</span>
                    <span>Set <strong>Microphone</strong> to <strong>Allow</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent-foreground text-xs font-bold flex items-center justify-center">4</span>
                    <span>Return here and tap the mic again</span>
                  </li>
                </ol>
                <button
                  onClick={onDismiss}
                  className="w-full h-12 rounded-2xl text-sm font-semibold bg-muted text-muted-foreground"
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <h2 className="text-center text-xl font-bold text-foreground mb-2">
                  Allow microphone access
                </h2>
                <p className="text-center text-sm text-muted-foreground mb-8 leading-relaxed">
                  To hear your voice, Safari will ask for microphone permission.{"\n"}
                  Tap <strong>Allow</strong> when prompted.
                </p>

                <button
                  onClick={onRequest}
                  className="w-full h-13 py-3.5 rounded-2xl text-sm font-semibold text-white mb-3 active:scale-[0.97] transition-transform"
                  style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
                >
                  Enable Microphone
                </button>
                <button
                  onClick={onDismiss}
                  className="w-full h-11 rounded-2xl text-sm font-medium text-muted-foreground"
                >
                  Not now
                </button>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
