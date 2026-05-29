import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ListTodo, MessageSquare, LayoutDashboard, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";

interface ContextCounts {
  urgentEmails: number;
  overdueTasks: number;
}

function useContextCounts() {
  const [counts, setCounts] = useState<ContextCounts>({ urgentEmails: 0, overdueTasks: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      const [emailRes, taskRes] = await Promise.all([
        supabase
          .from("email_metadata")
          .select("id", { count: "exact", head: true })
          .eq("category", "urgent")
          .eq("is_unread", true),
        supabase
          .from("action_items")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
          .lt("due_date", now),
      ]);
      setCounts({
        urgentEmails: emailRes.count ?? 0,
        overdueTasks: taskRes.count ?? 0,
      });
      setReady(true);
    })();
  }, []);

  return { counts, ready };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function ModeSelect() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const { counts, ready } = useContextCounts();
  const today = format(new Date(), "EEEE, MMMM d");
  const hasAlerts = counts.urgentEmails > 0 || counts.overdueTasks > 0;

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-5 pt-[var(--header-h)] pb-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] flex flex-col gap-6"
      >
        {/* Greeting */}
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">{today}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            {getGreeting()} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agentName} is ready when you are.
          </p>
        </div>

        {/* Smart context strip */}
        {ready && hasAlerts && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap gap-2"
          >
            {counts.urgentEmails > 0 && (
              <button
                onClick={() => navigate("/email")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {counts.urgentEmails} urgent email{counts.urgentEmails !== 1 ? "s" : ""}
              </button>
            )}
            {counts.overdueTasks > 0 && (
              <button
                onClick={() => navigate("/tasks")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
              >
                <ListTodo className="w-3.5 h-3.5" />
                {counts.overdueTasks} task{counts.overdueTasks !== 1 ? "s" : ""} overdue
              </button>
            )}
          </motion.div>
        )}

        {/* Primary: Decision Mode */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border-2 border-accent bg-card p-6 shadow-lg shadow-accent/10"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground leading-tight">
                Talk to {agentName}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Delegate tasks, get decisions, move fast.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/decision/text")}
              className="flex-1 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              Text
            </button>
            <button
              onClick={() => navigate("/decision/voice")}
              className="flex-1 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              Voice
            </button>
          </div>
          <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-accent mt-3 opacity-70">
            ★ Recommended
          </p>
        </motion.div>

        {/* Secondary: Workspace */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 active:scale-[0.98] transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold text-foreground">Open Workspace</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Email, calendar, tasks & more</p>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
        </motion.button>

        {/* Tertiary: Office (subtle) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <button
            onClick={() => navigate("/office")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Enter {agentName}'s Office
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
