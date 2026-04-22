import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";

export default function ModeSelect() {
  const navigate = useNavigate();
  const { agentName } = useAgent();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[480px] flex flex-col items-center"
      >
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground text-center mb-12 leading-tight">
          What do you want&nbsp;to&nbsp;do?
        </h1>

        <div className="w-full">
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/decision/voice")}
            aria-label={`Talk to ${agentName}`}
            className="group mx-auto mb-10 flex flex-col items-center gap-3"
          >
            <span className="relative flex items-center justify-center w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-accent to-primary text-accent-foreground shadow-xl shadow-accent/30 transition-shadow group-hover:shadow-2xl group-hover:shadow-accent/40">
              <span className="absolute inset-0 rounded-full bg-accent/30 animate-ping opacity-60" />
              <Mic className="w-12 h-12 sm:w-14 sm:h-14 relative z-10" strokeWidth={2.5} />
            </span>
            <span className="font-display text-lg font-semibold text-foreground">Tap to talk</span>
            <span className="text-xs text-muted-foreground -mt-1">Start a voice chat with {agentName}</span>
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border-[3px] border-accent bg-card p-6 shadow-lg shadow-accent/10 hover:shadow-xl transition-shadow relative"
          >
            <h2 className="font-display text-xl font-semibold text-foreground mb-1">Decision Mode–Delegate</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Tell {agentName} what you need. {agentName} will handle the thinking.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/decision/text")}
                className="flex-1 py-3.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
              >
                Text
              </button>
              <button
                onClick={() => navigate("/decision/voice")}
                className="flex-1 py-3.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
              >
                Voice
              </button>
            </div>
          </motion.div>
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-accent mt-3">★ Recommended</p>

          <div className="pt-24 md:pt-32 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="font-display text-xl font-semibold text-foreground mb-1">Detail Mode–Collaborate</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Open your workspace and work side-by-side with {agentName}.
              </p>
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                Enter Workspace
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="font-display text-xl font-semibold text-foreground mb-1">{agentName}'s Office</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Step into {agentName}'s virtual office. Browse notifications, chat, and more.
              </p>
              <button
                onClick={() => navigate("/office")}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent to-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Enter Office
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
