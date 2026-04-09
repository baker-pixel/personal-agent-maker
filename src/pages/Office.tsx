import { useState, useEffect, useCallback, useMemo } from "react";
import { useAgent } from "@/contexts/AgentContext";
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
  Moon,
  AlertCircle,
  ChevronRight,
  Smartphone,
} from "lucide-react";

/* ── Floating particles ── */
const PARTICLE_COUNT = 18;

interface Particle {
  id: number;
  x: number;      // % from left
  y: number;      // % from top
  size: number;    // px
  dur: number;     // seconds
  delay: number;   // seconds
  drift: number;   // horizontal drift px
}

function useParticles(): Particle[] {
  return useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      dur: 12 + Math.random() * 18,
      delay: Math.random() * -20,
      drift: -30 + Math.random() * 60,
    })),
  []);
}

/* ── Live clock ── */
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function AnalogClock({ size = 48 }: { size?: number }) {
  const time = useLiveClock();
  const s = time.getSeconds();
  const m = time.getMinutes();
  const h = time.getHours() % 12;
  const secDeg = s * 6;
  const minDeg = m * 6 + s * 0.1;
  const hrDeg = h * 30 + m * 0.5;
  const r = size / 2;

  // Roman numerals for the clock face
  const numerals = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg" style={{ filter: "drop-shadow(0 2px 8px hsl(var(--accent) / 0.15))" }}>
      {/* Outer ring with gradient */}
      <defs>
        <linearGradient id="clockRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--border))" stopOpacity="0.8" />
          <stop offset="50%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--border))" stopOpacity="0.8" />
        </linearGradient>
        <radialGradient id="clockFace" cx="40%" cy="35%">
          <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="1" />
        </radialGradient>
      </defs>
      {/* Outer bezel */}
      <circle cx={r} cy={r} r={r - 1} fill="url(#clockRing)" />
      {/* Inner face */}
      <circle cx={r} cy={r} r={r - 3} fill="url(#clockFace)" />
      {/* Subtle inner ring */}
      <circle cx={r} cy={r} r={r - 5} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.4} />

      {/* Hour marks and numerals */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30 - 90) * (Math.PI / 180);
        const outer = r - 6;
        const inner = i % 3 === 0 ? r - 12 : r - 9;
        const textR = r - 17;
        const showNumeral = size >= 60;
        return (
          <g key={i}>
            <line
              x1={r + Math.cos(angle) * inner}
              y1={r + Math.sin(angle) * inner}
              x2={r + Math.cos(angle) * outer}
              y2={r + Math.sin(angle) * outer}
              stroke="hsl(var(--foreground))"
              strokeWidth={i % 3 === 0 ? 2 : 1}
              strokeLinecap="round"
              opacity={i % 3 === 0 ? 0.7 : 0.3}
            />
            {showNumeral && i % 3 === 0 && (
              <text
                x={r + Math.cos(angle) * textR}
                y={r + Math.sin(angle) * textR}
                textAnchor="middle"
                dominantBaseline="central"
                fill="hsl(var(--foreground))"
                fontSize={size * 0.09}
                fontFamily="'Fraunces', serif"
                fontWeight={600}
                opacity={0.6}
              >
                {numerals[i]}
              </text>
            )}
          </g>
        );
      })}

      {/* Minute tick marks */}
      {Array.from({ length: 60 }, (_, i) => {
        if (i % 5 === 0) return null;
        const angle = (i * 6 - 90) * (Math.PI / 180);
        const outer = r - 6;
        const inner = r - 8;
        return (
          <line
            key={`m-${i}`}
            x1={r + Math.cos(angle) * inner}
            y1={r + Math.sin(angle) * inner}
            x2={r + Math.cos(angle) * outer}
            y2={r + Math.sin(angle) * outer}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={0.5}
            strokeLinecap="round"
            opacity={0.25}
          />
        );
      })}

      {/* Hour hand - tapered */}
      <line
        x1={r} y1={r}
        x2={r + Math.cos((hrDeg - 90) * Math.PI / 180) * (r * 0.42)}
        y2={r + Math.sin((hrDeg - 90) * Math.PI / 180) * (r * 0.42)}
        stroke="hsl(var(--foreground))" strokeWidth={3} strokeLinecap="round"
      />
      {/* Minute hand */}
      <line
        x1={r} y1={r}
        x2={r + Math.cos((minDeg - 90) * Math.PI / 180) * (r * 0.62)}
        y2={r + Math.sin((minDeg - 90) * Math.PI / 180) * (r * 0.62)}
        stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinecap="round"
      />
      {/* Second hand */}
      <line
        x1={r + Math.cos((secDeg + 90) * Math.PI / 180) * (r * 0.15)}
        y1={r + Math.sin((secDeg + 90) * Math.PI / 180) * (r * 0.15)}
        x2={r + Math.cos((secDeg - 90) * Math.PI / 180) * (r * 0.72)}
        y2={r + Math.sin((secDeg - 90) * Math.PI / 180) * (r * 0.72)}
        stroke="hsl(var(--accent))" strokeWidth={1} strokeLinecap="round"
      />
      {/* Center cap */}
      <circle cx={r} cy={r} r={3.5} fill="hsl(var(--accent))" />
      <circle cx={r} cy={r} r={1.5} fill="hsl(var(--accent-foreground))" />
    </svg>
  );
}

/* ── Steaming coffee ── */
function SteamingCoffee() {
  return (
    <div className="relative inline-block">
      <span className="text-2xl">☕</span>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-[3px]">
        {[0, 0.4, 0.8].map((delay, i) => (
          <motion.div
            key={i}
            className="w-[2px] rounded-full bg-muted-foreground/20"
            animate={{ height: [4, 10, 4], opacity: [0.3, 0.6, 0.3], y: [0, -6, 0] }}
            transition={{ duration: 2, delay, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

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
  {
    id: "eod-wrapup",
    label: "EOD Wrap-Up",
    description: "Summarize your day",
    icon: Moon,
    color: "from-violet-500/15 to-violet-500/5",
    borderColor: "border-violet-500/25",
    iconColor: "text-violet-500",
    action: "eod",
    position: "",
    emoji: "🌙",
  },
  {
    id: "sms-log",
    label: "SMS Log",
    description: "Text conversation history",
    icon: Smartphone,
    color: "from-teal-500/15 to-teal-500/5",
    borderColor: "border-teal-500/25",
    iconColor: "text-teal-500",
    action: "sms",
    position: "",
    emoji: "📱",
  },
];

export default function Office() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

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
      case "eod":
        navigate("/eod-wrapup");
        break;
      case "settings":
        navigate("/settings");
        break;
      case "sms":
        navigate("/sms-log");
        break;
    }
  }, [navigate]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const particles = useParticles();

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Ambient background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl"
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/3 rounded-full blur-3xl" />

        {/* Floating particles */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-accent/15"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
            animate={{
              y: [0, -60, 0],
              x: [0, p.drift, 0],
              opacity: [0, 0.6, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: p.dur,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate("/mode-select")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-4">
          {/* Live clock */}
          <AnalogClock size={56} />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">{agentName} is online</span>
          </div>
        </div>
      </header>

      {/* Status legend */}
      <div className="relative z-10 flex items-center justify-center gap-5 mb-2 px-4">
        <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-card/60 border border-border/30 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-muted-foreground">Online / Ready</span>
          </div>
          <div className="w-px h-3 bg-border/50" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[11px] text-muted-foreground">Needs Attention</span>
          </div>
          <div className="w-px h-3 bg-border/50" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-[11px] text-muted-foreground">Urgent</span>
          </div>
          <div className="w-px h-3 bg-border/50" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[11px] text-muted-foreground">Scheduled</span>
          </div>
        </div>
      </div>

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
          <p className="text-xs text-muted-foreground mt-2">
            Text {agentName} at <span className="font-mono font-semibold text-foreground">+1 (844) 392-6449</span>
          </p>
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
                    {item.id === "desk" ? `Chat with ${agentName}` : item.id === "sms-log" ? `${agentName} SMS Log` : item.label}
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
