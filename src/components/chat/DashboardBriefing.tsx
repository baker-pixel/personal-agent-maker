import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Calendar, Clock, AlertCircle, ExternalLink, ChevronRight, Loader2 } from "lucide-react";
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
        setEmailError("Sign in to see your emails");
        setEventError("Sign in to see your calendar");
        return;
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      // Fetch emails
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?maxResults=6&q=is:inbox`, { headers })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setEmailError(data.error);
          else setEmails(data.emails || []);
        })
        .catch(() => setEmailError("Could not load emails"))
        .finally(() => setLoadingEmails(false));

      // Fetch calendar
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
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Today's schedule section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Today's Schedule</h2>
            {todayEvents.length > 0 && (
              <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => onAskAssistant("Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.")}
            className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            Prep all <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {loadingEvents ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading calendar…</span>
          </div>
        ) : eventError ? (
          <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground/60">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">{eventError}</span>
          </div>
        ) : todayEvents.length === 0 && upcomingEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-6">No upcoming events</p>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <EventCard key={event.id} event={event} isToday onAskAssistant={onAskAssistant} />
            ))}
            {upcomingEvents.length > 0 && todayEvents.length > 0 && (
              <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider pt-2 pb-1 px-1">Coming up</p>
            )}
            {upcomingEvents.slice(0, 3).map((event) => (
              <EventCard key={event.id} event={event} isToday={false} onAskAssistant={onAskAssistant} />
            ))}
          </div>
        )}
      </section>

      {/* Priority inbox section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Priority Inbox</h2>
            {emails.filter((e) => e.isUnread).length > 0 && (
              <span className="text-[10px] font-medium bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                {emails.filter((e) => e.isUnread).length} unread
              </span>
            )}
          </div>
          <button
            onClick={() => onAskAssistant("Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.")}
            className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            Triage all <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {loadingEmails ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading emails…</span>
          </div>
        ) : emailError ? (
          <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground/60">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">{emailError}</span>
          </div>
        ) : emails.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-6">Inbox zero — nice!</p>
        ) : (
          <div className="space-y-1">
            {emails.map((email) => (
              <button
                key={email.id}
                onClick={() => onAskAssistant(`Tell me about this email from ${extractName(email.from)} with subject "${email.subject}" and draft a reply if needed.`)}
                className="w-full text-left group flex items-start gap-3 px-3.5 py-3 rounded-xl bg-card border border-border/40 hover:border-primary/15 hover:shadow-sm transition-all duration-150"
              >
                <div className="mt-0.5 shrink-0">
                  {email.isUnread ? (
                    <div className="w-2 h-2 rounded-full bg-accent" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-xs truncate ${email.isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                      {extractName(email.from)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">
                      {formatEmailDate(email.date)}
                    </span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${email.isUnread ? "text-foreground/90" : "text-muted-foreground"}`}>
                    {email.subject || "(No subject)"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5">
                    {email.snippet}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const EventCard = ({
  event,
  isToday: isTodayEvent,
  onAskAssistant,
}: {
  event: CalendarEvent;
  isToday: boolean;
  onAskAssistant: (prompt: string) => void;
}) => (
  <button
    onClick={() => onAskAssistant(`Prepare me for my meeting "${event.summary}". Who's attending and what should I know?`)}
    className={`w-full text-left group flex items-start gap-3 px-3.5 py-3 rounded-xl border transition-all duration-150 ${
      isTodayEvent
        ? "bg-primary/[0.03] border-primary/15 hover:border-primary/25 hover:shadow-sm"
        : "bg-card border-border/40 hover:border-primary/15 hover:shadow-sm"
    }`}
  >
    <div className={`mt-1 w-1 h-8 rounded-full shrink-0 ${isTodayEvent ? "bg-primary" : "bg-border"}`} />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <Clock className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground">{formatEventTime(event.start, event.end)}</span>
      </div>
      {event.attendees.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">
          {event.attendees.slice(0, 3).map((a) => a.displayName || a.email.split("@")[0]).join(", ")}
          {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
        </p>
      )}
    </div>
    {event.htmlLink && (
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 mt-1 transition-colors" />
    )}
  </button>
);
