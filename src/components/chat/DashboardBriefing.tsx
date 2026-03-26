import { useState, useEffect, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Calendar, Clock, AlertCircle, ChevronRight, Loader2, ArrowUpRight } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";

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
  htmlLink: string;
}

const extractName = (from: string) => {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
};

const getInitials = (name: string) => {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
};

const formatEventTime = (start: string, end: string) => {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    const day = isToday(s) ? "Today" : isTomorrow(s) ? "Tomorrow" : format(s, "EEE, MMM d");
    return `${day} · ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`;
  } catch {
    return start;
  }
};

const formatEmailDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, "h:mm a");
    return format(d, "MMM d");
  } catch {
    return "";
  }
};

export const DashboardBriefing = ({ onAskAssistant }: { onAskAssistant: (prompt: string) => void }) => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoadingEmails(false);
        setLoadingEvents(false);
        setEmailError("Connect your email to get started");
        setEventError("Connect your calendar to get started");
        return;
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?maxResults=6&q=is:inbox`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setEmailError(data.error);
          else setEmails(data.emails || []);
        })
        .catch(() => setEmailError("Could not load emails"))
        .finally(() => setLoadingEmails(false));

      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-fetch`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setEventError(data.error);
          else setEvents((data.events || []).slice(0, 6));
        })
        .catch(() => setEventError("Could not load calendar"))
        .finally(() => setLoadingEvents(false));
    };

    fetchData();
  }, []);

  const todayEvents = events.filter((e) => {
    try { return isToday(parseISO(e.start)); } catch { return false; }
  });
  const upcomingEvents = events.filter((e) => {
    try { return !isToday(parseISO(e.start)); } catch { return true; }
  });

  return (
    <div className="w-full max-w-3xl mx-auto grid md:grid-cols-2 gap-4 animate-fade-up" style={{ animationDelay: '0.15s' }}>
      {/* Today's schedule section */}
      <section className="bg-card rounded-2xl border border-border/40 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Schedule</h2>
              {todayEvents.length > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {todayEvents.length} today
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onAskAssistant("Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.")}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
          >
            Prep all <ArrowUpRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => onAskAssistant("Check my calendar for the next 7 days. Flag any double-bookings or conflicts. For each conflict, suggest which to reschedule and draft a message to the attendees.")}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/30"
          >
            Conflicts <AlertCircle className="w-3 h-3" />
          </button>
        </div>

        <div className="px-4 pb-4">
          {loadingEvents ? (
            <LoadingState text="Loading calendar…" />
          ) : eventError ? (
            <EmptyState text={eventError} />
          ) : todayEvents.length === 0 && upcomingEvents.length === 0 ? (
            <EmptyState text="No upcoming events — your day is clear!" />
          ) : (
            <div className="space-y-1.5">
              {todayEvents.map((event) => (
                <EventCard key={event.id} event={event} isToday onAskAssistant={onAskAssistant} />
              ))}
              {upcomingEvents.length > 0 && todayEvents.length > 0 && (
                <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest pt-3 pb-1 px-1">Coming up</p>
              )}
              {upcomingEvents.slice(0, 3).map((event) => (
                <EventCard key={event.id} event={event} isToday={false} onAskAssistant={onAskAssistant} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Priority inbox section */}
      <section className="bg-card rounded-2xl border border-border/40 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
              {emails.filter((e) => e.isUnread).length > 0 && (
                <span className="text-[10px] font-medium text-accent">
                  {emails.filter((e) => e.isUnread).length} unread
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAskAssistant("Auto-draft replies for all my emails that need a response. Generate context-aware, professional drafts I can review and approve.")}
              className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
            >
              Draft all <ArrowUpRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => onAskAssistant("Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.")}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/30"
            >
              Triage <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">
          {loadingEmails ? (
            <LoadingState text="Loading emails…" />
          ) : emailError ? (
            <EmptyState text={emailError} />
          ) : emails.length === 0 ? (
            <EmptyState text="Inbox zero — nice work! 🎉" />
          ) : (
            <div className="space-y-1">
              {emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => onAskAssistant(`Tell me about this email from ${extractName(email.from)} with subject "${email.subject}" and draft a reply if needed.`)}
                  className="w-full text-left group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all duration-200"
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      email.isUnread 
                        ? "bg-accent/15 text-accent ring-1 ring-accent/20" 
                        : "bg-muted text-muted-foreground/60"
                    }`}>
                      {getInitials(extractName(email.from))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs truncate ${email.isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/70"}`}>
                        {extractName(email.from)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
                        {formatEmailDate(email.date)}
                      </span>
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${email.isUnread ? "text-foreground/80" : "text-muted-foreground/70"}`}>
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
  );
};

const LoadingState = ({ text }: { text: string }) => (
  <div className="flex items-center justify-center py-10 text-muted-foreground">
    <Loader2 className="w-4 h-4 animate-spin mr-2 text-accent/50" />
    <span className="text-xs">{text}</span>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground/50">
    <span className="text-xs">{text}</span>
  </div>
);

const EventCard = forwardRef<HTMLButtonElement, {
  event: CalendarEvent;
  isToday: boolean;
  onAskAssistant: (prompt: string) => void;
}>(({ event, isToday: isTodayEvent, onAskAssistant }, ref) => (
  <button
    ref={ref}
    onClick={() => onAskAssistant(`Prepare me for my meeting "${event.summary}". Who's attending and what should I know?`)}
    className={`w-full text-left group flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
      isTodayEvent
        ? "hover:bg-primary/[0.04]"
        : "hover:bg-muted/50"
    }`}
  >
    <div className={`mt-1.5 w-1 h-7 rounded-full shrink-0 ${isTodayEvent ? "bg-accent" : "bg-border"}`} />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <Clock className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground/70">{formatEventTime(event.start, event.end)}</span>
      </div>
      {event.attendees.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          {event.attendees.slice(0, 3).map((a, i) => (
            <div key={i} className="w-5 h-5 rounded-full bg-muted text-[7px] font-bold text-muted-foreground/60 flex items-center justify-center ring-1 ring-card" style={{ marginLeft: i > 0 ? '-4px' : 0, zIndex: 3 - i }}>
              {getInitials(a.displayName || a.email.split("@")[0])}
            </div>
          ))}
          {event.attendees.length > 3 && (
            <span className="text-[10px] text-muted-foreground/40 ml-1">+{event.attendees.length - 3}</span>
          )}
        </div>
      )}
    </div>
  </button>
));
EventCard.displayName = "EventCard";

