// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, X, Clock, AlertTriangle, Mail, Calendar,
  CheckCircle2, ChevronRight, Sparkles, Loader2, ListTodo, BellRing,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Notification {
  id: string;
  type: "urgent" | "follow_up" | "meeting" | "deadline" | "info" | "briefing";
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  actionPath?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const typeConfig = {
  urgent:    { icon: AlertTriangle,  color: "text-destructive", bg: "bg-destructive/8",  ring: "ring-destructive/20" },
  follow_up: { icon: Mail,           color: "text-accent",      bg: "bg-accent/8",        ring: "ring-accent/15"      },
  meeting:   { icon: Calendar,       color: "text-accent",      bg: "bg-accent/8",        ring: "ring-accent/15"      },
  deadline:  { icon: ListTodo,       color: "text-orange-500",  bg: "bg-orange-500/8",    ring: "ring-orange-500/20"  },
  info:      { icon: CheckCircle2,   color: "text-green-500",   bg: "bg-green-500/8",     ring: "ring-green-500/15"   },
  briefing:  { icon: Sparkles,       color: "text-accent",      bg: "bg-accent/10",       ring: "ring-accent/20"      },
};

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem("normy_dismissed_alerts") || "[]"); } catch { return []; }
}
function addDismissed(id: string) {
  const d = getDismissed();
  localStorage.setItem("normy_dismissed_alerts", JSON.stringify([...d, id]));
}

export const NotificationCenter = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const initialized = useRef(false);
  const { permission, requestPermission } = usePushNotifications();

  const addNotifs = useCallback((fresh: Notification[]) => {
    const dismissed = getDismissed();
    setNotifications(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const toAdd = fresh.filter(n => !dismissed.includes(n.id) && !existingIds.has(n.id));
      if (toAdd.length === 0) return prev;
      return [...toAdd, ...prev];
    });
  }, []);

  // Pull REAL data for alerts — urgent emails, overdue tasks
  const loadRealAlerts = useCallback(async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const alerts: Notification[] = [];

    const nowIso = now.toISOString();
    const [urgentRes, overdueRes] = await Promise.all([
      // Same filter as EmailSummaryWidget + useTodayData: unreplied + not snoozed
      supabase
        .from("email_metadata")
        .select("id", { count: "exact", head: true })
        .eq("category", "urgent")
        .is("replied_at", null)
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
      supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .not("due_date", "is", null)
        .lt("due_date", todayStr),
    ]);

    const urgentCount = urgentRes.count ?? 0;
    const overdueCount = overdueRes.count ?? 0;

    if (urgentCount > 0) {
      alerts.push({
        id: `urgent-emails-${todayStr}`,
        type: "urgent",
        title: `${urgentCount} urgent email${urgentCount > 1 ? "s" : ""} need attention`,
        body: "These emails require immediate action or a reply today.",
        timestamp: now,
        read: false,
        actionLabel: "View urgent emails",
        actionPath: "/email",
      });
    }

    if (overdueCount > 0) {
      alerts.push({
        id: `overdue-tasks-${todayStr}`,
        type: "deadline",
        title: `${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}`,
        body: "These tasks are past their due date and need to be completed or rescheduled.",
        timestamp: now,
        read: false,
        actionLabel: "Review tasks",
        actionPath: "/tasks",
      });
    }

    addNotifs(alerts);
  }, [addNotifs]);

  // Time-based contextual nudges
  const loadTimeAlerts = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    const dateStr = now.toDateString();
    const nudges: Notification[] = [];

    if (hour >= 8 && hour < 10) {
      nudges.push({
        id: `morning-focus-${dateStr}`,
        type: "briefing",
        title: "Start your day",
        body: "Your tasks and meetings for today are ready. Check your Today's Focus on the dashboard.",
        timestamp: now,
        read: false,
        actionLabel: "Go to dashboard",
        actionPath: "/dashboard",
      });
    }

    if (hour >= 13 && hour < 15) {
      nudges.push({
        id: `afternoon-followup-${dateStr}`,
        type: "follow_up",
        title: "Afternoon check-in",
        body: "Good time to follow up on any unanswered emails from this morning.",
        timestamp: now,
        read: false,
        actionLabel: "Check emails",
        actionPath: "/email",
      });
    }

    if (hour >= 17 && hour < 19) {
      nudges.push({
        id: `eod-wrapup-${dateStr}`,
        type: "info",
        title: "End-of-day wrap-up",
        body: "Review what got done today and flag anything for tomorrow.",
        timestamp: now,
        read: false,
        actionLabel: "View tasks",
        actionPath: "/tasks",
      });
    }

    addNotifs(nudges);
  }, [addNotifs]);

  // On-demand daily briefing
  const fetchBriefing = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const briefingId = `daily-briefing-${today}`;
    if (getDismissed().includes(briefingId)) return;

    setLoadingBriefing(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-briefing", {});
      if (!error && !data?.error && data?.summary) {
        addNotifs([{
          id: briefingId,
          type: "briefing",
          title: "Your daily briefing",
          body: data.summary,
          timestamp: new Date(),
          read: false,
          actionLabel: "Go to dashboard",
          actionPath: "/dashboard",
        }]);
      }
    } catch { /* silent */ } finally {
      setLoadingBriefing(false);
    }
  }, [addNotifs]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadRealAlerts();
    loadTimeAlerts();
    const interval = setInterval(() => {
      loadRealAlerts();
      loadTimeAlerts();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadRealAlerts, loadTimeAlerts]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const dismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    addDismissed(id);
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleAction = (n: Notification) => {
    markRead(n.id);
    n.onAction?.();
    if (n.actionPath) navigate(n.actionPath);
    setOpen(false);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(v => !v); notifications.forEach(n => markRead(n.id)); }}
        className={`relative p-2.5 rounded-xl transition-all duration-200 ${
          open ? "bg-accent/10 text-accent" : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        }`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-destructive text-[10px] font-bold text-white rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-[360px] bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden"
            style={{ animation: "fade-up 0.15s ease-out both" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <h3 className="font-display text-sm font-semibold text-foreground">Notifications</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchBriefing}
                  disabled={loadingBriefing}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-accent/5"
                  title="Get AI daily briefing"
                >
                  {loadingBriefing
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />}
                  Briefing
                </button>
                <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            {/* Enable push notifications prompt */}
            {permission === "default" && (
              <button
                onClick={requestPermission}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/20 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 ring-1 ring-accent/20 flex items-center justify-center shrink-0">
                  <BellRing className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">Enable push notifications</p>
                  <p className="text-xs text-muted-foreground">Get alerted for meetings, urgent emails & overdue tasks — even when the tab is in the background.</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            )}

            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/60">All caught up</p>
                </div>
              ) : (
                notifications.map(n => {
                  const cfg = typeConfig[n.type];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 px-4 py-3.5 border-b border-border/20 last:border-0 transition-colors hover:bg-muted/20 ${
                        !n.read ? "bg-accent/[0.02]" : ""
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                          <span className="text-[10px] text-muted-foreground/40 shrink-0">{formatTime(n.timestamp)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{n.body}</p>
                        {n.actionLabel && (
                          <button
                            onClick={() => handleAction(n)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors"
                          >
                            {n.actionLabel}
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="p-1 rounded text-muted-foreground/20 hover:text-muted-foreground/60 shrink-0 self-start"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};