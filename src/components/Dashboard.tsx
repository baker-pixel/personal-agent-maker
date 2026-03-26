import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useDraftActions } from "@/hooks/useDraftActions";
import {
  Sun,
  Mail,
  Calendar,
  Clock,
  Inbox,
  MessageSquare,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { WeeklySummaryWidget } from "./dashboard/WeeklySummaryWidget";

interface DashboardProps {
  onNavigateToChat: (prompt?: string) => void;
  onNavigateToInbox: () => void;
}

interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: { email: string; displayName?: string; responseStatus: string }[];
}

interface ActivityItem {
  id: string;
  type: "draft" | "conversation" | "reminder";
  title: string;
  subtitle: string;
  time: string;
  icon: React.ElementType;
}

const extractName = (from: string) => {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
};

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const formatTime = (start: string, end: string) => {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    const day = isToday(s) ? "Today" : isTomorrow(s) ? "Tomorrow" : format(s, "EEE, MMM d");
    return `${day} · ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`;
  } catch {
    return start;
  }
};

export const Dashboard = ({ onNavigateToChat, onNavigateToInbox }: DashboardProps) => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { drafts } = useDraftActions();
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadingEmails(false);
        setLoadingEvents(false);
        setLoadingActivity(false);
        return;
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      // Fetch emails
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?maxResults=5&q=is:inbox`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) setEmails(data.emails || []);
        })
        .catch(() => {})
        .finally(() => setLoadingEmails(false));

      // Fetch calendar
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-fetch`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) setEvents((data.events || []).slice(0, 5));
        })
        .catch(() => {})
        .finally(() => setLoadingEvents(false));

      // Fetch recent activity (conversations)
      const { data: convos } = await supabase
        .from("chat_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5);

      const items: ActivityItem[] = [];

      if (convos) {
        convos.forEach((c) => {
          items.push({
            id: c.id,
            type: "conversation",
            title: c.title,
            subtitle: "Chat conversation",
            time: formatRelative(c.updated_at),
            icon: MessageSquare,
          });
        });
      }

      // Add pending drafts as activity
      drafts.forEach((d) => {
        items.push({
          id: d.id,
          type: "draft",
          title: d.subject || "Draft reply",
          subtitle: `To ${d.to_name || d.to_email || "someone"}`,
          time: formatRelative(d.created_at),
          icon: FileText,
        });
      });

      items.sort((a, b) => b.time.localeCompare(a.time));
      setActivity(items.slice(0, 8));
      setLoadingActivity(false);
    };

    fetchData();
  }, [drafts]);

  const todayEvents = events.filter((e) => {
    try {
      return isToday(parseISO(e.start));
    } catch {
      return false;
    }
  });
  const unreadCount = emails.filter((e) => e.isUnread).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* Greeting */}
        <div className="animate-fade-up">
          <h1 className="font-display text-3xl md:text-4xl text-foreground">
            {greeting} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what {agentName} has lined up for you today.
          </p>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-up" style={{ animationDelay: "0.05s" }}>
          <StatCard
            icon={Mail}
            value={loadingEmails ? "…" : String(unreadCount)}
            label="Unread emails"
            accent={unreadCount > 0}
            onClick={() => onNavigateToChat("Triage my inbox. Categorize recent emails and draft responses for anything urgent.")}
          />
          <StatCard
            icon={Calendar}
            value={loadingEvents ? "…" : String(todayEvents.length)}
            label="Meetings today"
            accent={todayEvents.length > 0}
            onClick={() => onNavigateToChat("Prepare me for today's meetings with talking points and attendee context.")}
          />
          <StatCard
            icon={Inbox}
            value={String(drafts.length)}
            label="Pending approvals"
            accent={drafts.length > 0}
            onClick={onNavigateToInbox}
          />
          <StatCard
            icon={Sparkles}
            value={loadingActivity ? "…" : String(activity.length)}
            label="Recent actions"
            onClick={() => {}}
          />
        </div>

        <div className="grid md:grid-cols-5 gap-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          {/* Schedule — left column */}
          <div className="md:col-span-3 space-y-6">
            {/* Today's schedule */}
            <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Today's Schedule</h2>
                </div>
                <button
                  onClick={() =>
                    onNavigateToChat("Prepare me for all of today's meetings. Pull context from recent emails with each attendee and suggest talking points.")
                  }
                  className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
                >
                  Prep all <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              <div className="px-4 pb-4">
                {loadingEvents ? (
                  <LoadingRow text="Loading calendar…" />
                ) : todayEvents.length === 0 ? (
                  <EmptyRow text="No meetings today — your day is clear! 🎉" />
                ) : (
                  <div className="space-y-1">
                    {todayEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() =>
                          onNavigateToChat(`Prepare me for my meeting "${event.summary}". Who's attending and what should I know?`)
                        }
                        className="w-full text-left group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all"
                      >
                        <div className="mt-1.5 w-1 h-7 rounded-full bg-accent shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-3 h-3 text-muted-foreground/40" />
                            <span className="text-[11px] text-muted-foreground/70">
                              {formatTime(event.start, event.end)}
                            </span>
                          </div>
                          {event.attendees?.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5">
                              {event.attendees.slice(0, 3).map((a, i) => (
                                <div
                                  key={i}
                                  className="w-5 h-5 rounded-full bg-muted text-[7px] font-bold text-muted-foreground/60 flex items-center justify-center ring-1 ring-card"
                                  style={{ marginLeft: i > 0 ? "-4px" : 0, zIndex: 3 - i }}
                                >
                                  {getInitials(a.displayName || a.email.split("@")[0])}
                                </div>
                              ))}
                              {event.attendees.length > 3 && (
                                <span className="text-[10px] text-muted-foreground/40 ml-1">
                                  +{event.attendees.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Priority inbox */}
            <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-accent" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Priority Inbox</h2>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-medium text-accent">{unreadCount} unread</span>
                  )}
                </div>
                <button
                  onClick={() =>
                    onNavigateToChat("Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.")
                  }
                  className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
                >
                  Triage all <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              <div className="px-4 pb-4">
                {loadingEmails ? (
                  <LoadingRow text="Loading emails…" />
                ) : emails.length === 0 ? (
                  <EmptyRow text={isConnected("gmail") ? "Inbox zero — nice work! 🎉" : "Connect Gmail to see your inbox"} />
                ) : (
                  <div className="space-y-1">
                    {emails.slice(0, 4).map((email) => (
                      <button
                        key={email.id}
                        onClick={() =>
                          onNavigateToChat(`Tell me about this email from ${extractName(email.from)} with subject "${email.subject}" and draft a reply if needed.`)
                        }
                        className="w-full text-left group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all"
                      >
                        <div className="mt-0.5 shrink-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              email.isUnread
                                ? "bg-accent/15 text-accent ring-1 ring-accent/20"
                                : "bg-muted text-muted-foreground/60"
                            }`}
                          >
                            {getInitials(extractName(email.from))}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={`text-xs truncate ${
                                email.isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/70"
                              }`}
                            >
                              {extractName(email.from)}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              email.isUnread ? "text-foreground/80" : "text-muted-foreground/70"
                            }`}
                          >
                            {email.subject || "(No subject)"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Activity feed — right column */}
          <div className="md:col-span-2">
            <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                </div>
              </div>
              <div className="px-4 pb-4">
                {loadingActivity ? (
                  <LoadingRow text="Loading activity…" />
                ) : activity.length === 0 ? (
                  <EmptyRow text="No recent activity yet" />
                ) : (
                  <div className="space-y-0.5">
                    {activity.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/30 transition-all cursor-default"
                        >
                          <div className="mt-0.5 w-6 h-6 rounded-md bg-muted/80 flex items-center justify-center shrink-0">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground/60 truncate">{item.subtitle}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/40 shrink-0 mt-0.5">{item.time}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Quick actions */}
            <section className="mt-4 bg-card rounded-2xl border border-border/40 overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              </div>
              <div className="px-4 pb-4 space-y-1.5">
                <QuickAction
                  icon={Sun}
                  label="Generate morning briefing"
                  onClick={() => onNavigateToChat("Give me my full morning briefing — summarize my inbox, today's meetings, and any follow-ups.")}
                />
                <QuickAction
                  icon={Mail}
                  label="Draft all pending replies"
                  onClick={() => onNavigateToChat("Auto-draft replies for all my emails that need a response.")}
                />
                <QuickAction
                  icon={AlertCircle}
                  label="Check for scheduling conflicts"
                  onClick={() => onNavigateToChat("Check my calendar for conflicts this week and suggest resolutions.")}
                />
                <QuickAction
                  icon={CheckCircle2}
                  label="Review pending approvals"
                  onClick={onNavigateToInbox}
                />
              </div>
            </section>
          </div>
        </div>

        {/* Weekly Summary — full width */}
        <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <WeeklySummaryWidget />
        </div>
      </div>
    </div>
  );
};

// Sub-components

const StatCard = ({
  icon: Icon,
  value,
  label,
  accent,
  onClick,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  accent?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="bg-card rounded-xl border border-border/40 p-4 flex items-center gap-3 hover:border-border/80 transition-all text-left"
  >
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? "bg-accent/10" : "bg-muted"}`}>
      <Icon className={`w-4 h-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
    </div>
    <div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  </button>
);

const QuickAction = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-all"
  >
    <Icon className="w-4 h-4 text-muted-foreground" />
    {label}
    <ArrowUpRight className="w-3 h-3 ml-auto text-muted-foreground/40" />
  </button>
);

const LoadingRow = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-8 text-muted-foreground">
    <Loader2 className="w-4 h-4 animate-spin mr-2 text-accent/50" />
    <span className="text-xs">{text}</span>
  </div>
);

const EmptyRow = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-8 text-muted-foreground/50">
    <span className="text-xs">{text}</span>
  </div>
);

function formatRelative(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return format(d, "MMM d");
  } catch {
    return "";
  }
}
