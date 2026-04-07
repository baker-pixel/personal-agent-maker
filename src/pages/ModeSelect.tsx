import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function ModeSelect() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Annie");

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try {
        setAgentName(JSON.parse(stored).agentName || "Annie");
      } catch {}
    }
  }, []);

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

        <div className="w-full space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border-2 border-accent/20 bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
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
      </motion.div>
    </div>
  );
}
