import { useState, useEffect, useCallback } from "react";
import { Bell, X, Clock, AlertTriangle, Mail, Calendar, CheckCircle2, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Notification {
  id: string;
  type: "urgent" | "follow_up" | "meeting" | "deadline" | "info" | "briefing";
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationCenterProps {
  onSendMessage?: (message: string) => void;
}

const typeConfig = {
  urgent: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/8", ring: "ring-destructive/15" },
  follow_up: { icon: Mail, color: "text-accent", bg: "bg-accent/8", ring: "ring-accent/15" },
  meeting: { icon: Calendar, color: "text-info", bg: "bg-info/8", ring: "ring-info/15" },
  deadline: { icon: Clock, color: "text-warning", bg: "bg-warning/8", ring: "ring-warning/15" },
  info: { icon: CheckCircle2, color: "text-success", bg: "bg-success/8", ring: "ring-success/15" },
  briefing: { icon: Sparkles, color: "text-accent", bg: "bg-accent/10", ring: "ring-accent/20" },
};

export const NotificationCenter = ({ onSendMessage }: NotificationCenterProps) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  // Fetch AI-generated daily briefing
  const fetchDailyBriefing = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const today = new Date().toISOString().split("T")[0];
      const briefingId = `daily-briefing-${today}`;
      const dismissed = JSON.parse(localStorage.getItem("normy_dismissed_alerts") || "[]");
      if (dismissed.includes(briefingId)) return;

      setLoadingBriefing(true);

      const { data, error } = await supabase.functions.invoke("daily-briefing", {});

      if (error || data?.error) {
        console.error("Briefing error:", error || data?.error);
        setLoadingBriefing(false);
        return;
      }

      const briefingNotif: Notification = {
        id: briefingId,
        type: "briefing",
        title: "☀️ Your daily briefing",
        body: data.summary,
        timestamp: new Date(),
        read: false,
        actionLabel: "Open full briefing",
        onAction: () => onSendMessage?.("Give me my morning briefing. Summarize what I need to know today — key emails, meetings, follow-ups, and priorities."),
      };

      setNotifications((prev) => {
        if (prev.some((n) => n.id === briefingId)) return prev;
        return [briefingNotif, ...prev];
      });

      setLoadingBriefing(false);
    } catch (e) {
      console.error("Failed to fetch briefing:", e);
      setLoadingBriefing(false);
    }
  }, [onSendMessage]);

  const generateProactiveAlerts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const alerts: Notification[] = [];
      const now = new Date();
      const hour = now.getHours();

      if (hour >= 8 && hour < 18) {
        alerts.push({
          id: `prep-${now.getHours()}`,
          type: "meeting",
          title: "Upcoming meeting",
          body: "You may have meetings starting soon. Want me to prep context?",
          timestamp: now,
          read: false,
          actionLabel: "Prep meetings",
          onAction: () => onSendMessage?.("Prep me for my upcoming meetings"),
        });
      }

      if (hour >= 13 && hour < 16) {
        alerts.push({
          id: `followup-${now.toDateString()}`,
          type: "follow_up",
          title: "Follow-up check",
          body: "Some sent emails may still be unanswered. Let me check.",
          timestamp: now,
          read: false,
          actionLabel: "Check follow-ups",
          onAction: () => onSendMessage?.("Check my follow-ups and unanswered emails"),
        });
      }

      if (hour >= 17 && hour < 19) {
        alerts.push({
          id: `wrapup-${now.toDateString()}`,
          type: "deadline",
          title: "End-of-day wrap-up",
          body: "Let me summarize what got done today and flag anything for tomorrow.",
          timestamp: now,
          read: false,
          actionLabel: "Wrap up my day",
          onAction: () => onSendMessage?.("Give me an end-of-day summary and flag anything for tomorrow"),
        });
      }

      const dismissed = JSON.parse(localStorage.getItem("normy_dismissed_alerts") || "[]");
      const fresh = alerts.filter((a) => !dismissed.includes(a.id));
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newAlerts = fresh.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newAlerts];
      });
    } catch (e) {
      console.error("Failed to generate alerts:", e);
    }
  }, [onSendMessage]);

  useEffect(() => {
    fetchDailyBriefing();
    generateProactiveAlerts();
    const interval = setInterval(generateProactiveAlerts, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDailyBriefing, generateProactiveAlerts]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const dismissed = JSON.parse(localStorage.getItem("normy_dismissed_alerts") || "[]");
    localStorage.setItem("normy_dismissed_alerts", JSON.stringify([...dismissed, id]));
  };

  const handleAction = (n: Notification) => {
    n.onAction?.();
    dismiss(n.id);
    setOpen(false);
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2.5 rounded-xl transition-all duration-200 ${
          open ? "bg-accent/10 text-accent" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50"
        }`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-[10px] font-bold text-accent-foreground rounded-full flex items-center justify-center animate-scale-in">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-[380px] bg-card border border-border/50 rounded-2xl shadow-elevated overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <h3 className="font-display text-sm text-foreground">Notifications</h3>
              {loadingBriefing && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent/50" />}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground/60">
                  You're all caught up ✨
                </div>
              ) : (
                notifications.map((n) => {
                  const cfg = typeConfig[n.type];
                  const Icon = cfg.icon;
                  const isBriefing = n.type === "briefing";
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 px-5 py-4 border-b border-border/20 last:border-0 transition-colors ${
                        isBriefing ? "bg-accent/[0.03] hover:bg-accent/[0.06]" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium text-foreground ${isBriefing ? "font-semibold" : ""}`}>{n.title}</p>
                          <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{formatTime(n.timestamp)}</span>
                        </div>
                        <p className={`text-xs mt-0.5 leading-relaxed ${isBriefing ? "text-foreground/80" : "text-muted-foreground"}`}>
                          {n.body}
                        </p>
                        {n.actionLabel && (
                          <button
                            onClick={() => handleAction(n)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
                          >
                            {n.actionLabel}
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => dismiss(n.id)}
                        className="p-1 rounded text-muted-foreground/30 hover:text-muted-foreground/60 flex-shrink-0 self-start"
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
