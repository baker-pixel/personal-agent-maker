import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare,
  Mail,
  CalendarDays,
  ListTodo,
  Inbox,
  Settings,
  X,
  Sparkles,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

interface BriefingData {
  unreadEmails: number;
  upcomingMeetings: number;
  pendingApprovals: number;
  actionItems: number;
}

const officeItems = [
  {
    id: "desk",
    label: "Chat with Normy",
    description: "Sit down and talk to your agent",
    icon: MessageSquare,
    color: "from-accent/20 to-accent/5",
    borderColor: "border-accent/30",
    iconColor: "text-accent",
    action: "chat",
    position: "col-span-2 row-span-2",
    emoji: "💻",
  },
  {
    id: "inbox-tray",
    label: "Inbox Tray",
    description: "Pending approvals & drafts",
    icon: Inbox,
    color: "from-orange-500/15 to-orange-500/5",
    borderColor: "border-orange-500/25",
    iconColor: "text-orange-500",
    action: "inbox",
    position: "",
    emoji: "📥",
  },
  {
    id: "whiteboard",
    label: "Task Board",
    description: "Action items & to-dos",
    icon: ListTodo,
    color: "from-emerald-500/15 to-emerald-500/5",
    borderColor: "border-emerald-500/25",
    iconColor: "text-emerald-500",
    action: "tasks",
    position: "",
    emoji: "📋",
  },
  {
    id: "calendar",
    label: "Wall Calendar",
    description: "Schedule & meetings",
    icon: CalendarDays,
    color: "from-blue-500/15 to-blue-500/5",
    borderColor: "border-blue-500/25",
    iconColor: "text-blue-500",
    action: "calendar",
    position: "",
    emoji: "📅",
  },
  {
    id: "mailbox",
    label: "Mail Station",
    description: "Email triage & follow-ups",
    icon: Mail,
    color: "from-rose-500/15 to-rose-500/5",
    borderColor: "border-rose-500/25",
    iconColor: "text-rose-500",
    action: "email",
    position: "",
    emoji: "✉️",
  },
  {
    id: "settings-drawer",
    label: "Settings Drawer",
    description: "Preferences & integrations",
    icon: Settings,
    color: "from-muted-foreground/10 to-muted-foreground/5",
    borderColor: "border-muted-foreground/20",
    iconColor: "text-muted-foreground",
    action: "settings",
    position: "",
    emoji: "⚙️",
  },
];

export default function Office() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Normy");
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("agent-name");
    if (stored) setAgentName(stored);
  }, []);

  // Fetch quick stats for briefing
  useEffect(() => {
    const fetchBriefing = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [draftsRes, itemsRes] = await Promise.all([
        supabase
          .from("draft_actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "pending"),
        supabase
          .from("action_items")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ["pending", "in_progress"]),
      ]);

      setBriefing({
        unreadEmails: 0,
        upcomingMeetings: 0,
        pendingApprovals: draftsRes.count ?? 0,
        actionItems: itemsRes.count ?? 0,
      });
    };
    fetchBriefing();
  }, []);

  // Entry animation
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case "chat":
        navigate("/decision/text");
        break;
      case "inbox":
        navigate("/dashboard");
        break;
      case "tasks":
        navigate("/dashboard");
        break;
      case "calendar":
        navigate("/calendar");
        break;
      case "email":
        navigate("/email");
        break;
      case "settings":
        navigate("/settings");
        break;
    }
  }, [navigate]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/3 rounded-full blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate("/mode-select")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">{agentName} is online</span>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-5 pb-10">
        {/* Agent greeting */}
        <AnimatePresence>
          {showGreeting && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
              className="mb-8"
            >
              <div className="relative bg-card border border-border/50 rounded-2xl p-6 shadow-lg max-w-2xl mx-auto">
                <button
                  onClick={() => setShowGreeting(false)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-lg font-semibold text-foreground mb-1">
                      {getGreeting()}! Welcome to the office.
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      Here's what's on your plate today:
                    </p>

                    {briefing && (
                      <div className="grid grid-cols-2 gap-3">
                        {briefing.pendingApprovals > 0 && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1 }}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/15"
                          >
                            <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                            <span className="text-xs font-medium text-foreground">
                              {briefing.pendingApprovals} pending approval{briefing.pendingApprovals !== 1 ? "s" : ""}
                            </span>
                          </motion.div>
                        )}
                        {briefing.actionItems > 0 && (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1.15 }}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15"
                          >
                            <ListTodo className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-xs font-medium text-foreground">
                              {briefing.actionItems} open task{briefing.actionItems !== 1 ? "s" : ""}
                            </span>
                          </motion.div>
                        )}
                        {briefing.pendingApprovals === 0 && briefing.actionItems === 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1 }}
                            className="col-span-2 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15"
                          >
                            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-xs font-medium text-foreground">
                              All clear! Nothing urgent right now.
                            </span>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Speech bubble tail */}
                <div className="absolute -bottom-2 left-10 w-4 h-4 bg-card border-b border-r border-border/50 rotate-45" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Office title */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: entered ? 1 : 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-1">
            {agentName}'s Office
          </h1>
          <p className="text-sm text-muted-foreground">Click on anything to get started</p>
        </motion.div>

        {/* Office grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {officeItems.map((item, i) => {
            const Icon = item.icon;
            const isHovered = hoveredItem === item.id;

            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 30, scale: entered ? 1 : 0.9 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5, ease: "easeOut" }}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => handleAction(item.action)}
                className={`${item.id === "desk" ? "col-span-2 md:col-span-2" : ""} relative group rounded-2xl border ${item.borderColor} bg-gradient-to-br ${item.color} p-5 sm:p-6 text-left transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] overflow-hidden`}
              >
                {/* Subtle shine effect on hover */}
                <div className={`absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] transition-transform duration-700 ${isHovered ? "translate-x-[100%]" : ""}`} />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl sm:text-4xl">{item.emoji}</span>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground/30 transition-all duration-300 ${isHovered ? "translate-x-1 text-foreground/50" : ""}`} />
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-semibold text-foreground mb-0.5">
                    {item.label}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>

                  {/* Badge for desk */}
                  {item.id === "desk" && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      <span className="text-xs font-medium text-accent">Agent ready</span>
                    </div>
                  )}

                  {/* Count badges */}
                  {item.id === "inbox-tray" && briefing && briefing.pendingApprovals > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/20">
                      <span className="text-xs font-semibold text-orange-600">{briefing.pendingApprovals}</span>
                    </div>
                  )}
                  {item.id === "whiteboard" && briefing && briefing.actionItems > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/20">
                      <span className="text-xs font-semibold text-emerald-600">{briefing.actionItems}</span>
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
