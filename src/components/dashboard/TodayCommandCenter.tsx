// @ts-nocheck
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Calendar, Mail, AlertTriangle, Clock, ArrowRight,
  MapPin, Users, Zap, CheckCircle2, MessageSquareReply,
  Sparkles, ChevronRight, PenLine, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useTodayData, type TodayEvent } from "@/hooks/useTodayData";
import { useAgent } from "@/contexts/AgentContext";

interface AttendeeEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  received_at: string;
  ai_summary: string | null;
  category: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDuration(start: string, end: string): string {
  try {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  } catch {
    return "";
  }
}

function countdownLabel(minutes: number | null, isInMeeting: boolean): {
  label: string;
  color: string;
  pulse: boolean;
} {
  if (isInMeeting) return { label: "In progress", color: "text-green-500", pulse: true };
  if (minutes === null) return { label: "", color: "", pulse: false };
  if (minutes <= 0) return { label: "Now", color: "text-green-500", pulse: true };
  if (minutes <= 5) return { label: `${minutes} min`, color: "text-destructive", pulse: true };
  if (minutes <= 30) return { label: `${minutes} min`, color: "text-orange-500", pulse: false };
  if (minutes < 60) return { label: `${minutes} min`, color: "text-accent", pulse: false };
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return { label: rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`, color: "text-muted-foreground", pulse: false };
}

// ─── Pre-meeting prep card ────────────────────────────────────────────────────

function PreMeetingCard({ event, minutesUntil, attendeeEmails }: {
  event: TodayEvent;
  minutesUntil: number;
  attendeeEmails: AttendeeEmail[];
}) {
  const navigate = useNavigate();
  const attendees = event.attendees
    .filter(a => !a.email?.includes("calendar.google.com"))
    .slice(0, 3);

  const urgency = minutesUntil <= 5 ? "destructive" : minutesUntil <= 15 ? "orange" : "accent";
  const bg = urgency === "destructive" ? "bg-destructive/5 border-destructive/30" :
             urgency === "orange" ? "bg-orange-500/5 border-orange-500/30" :
             "bg-accent/5 border-accent/30";
  const dotColor = urgency === "destructive" ? "bg-destructive" :
                   urgency === "orange" ? "bg-orange-500" : "bg-accent";
  const textColor = urgency === "destructive" ? "text-destructive" :
                    urgency === "orange" ? "text-orange-500" : "text-accent";

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${bg}`} style={{ animation: "fade-up 0.3s ease-out both" }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 mt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          {minutesUntil <= 15 && (
            <div className={`absolute inset-0 rounded-full ${dotColor} opacity-40 animate-ping`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={`text-xs font-semibold uppercase tracking-wider ${textColor}`}>
              {minutesUntil <= 0 ? "In progress" : `Starting in ${minutesUntil} min`}
            </p>
            <span className="text-xs text-muted-foreground shrink-0">{formatTime(event.start)}</span>
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{event.summary}</p>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {event.location && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {event.location.length > 30 ? event.location.slice(0, 30) + "…" : event.location}
              </span>
            )}
            {attendees.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {attendees.map(a => a.displayName || a.email.split("@")[0]).join(", ")}
                {event.attendees.filter(a => !a.email?.includes("calendar.google.com")).length > 3 &&
                  ` +${event.attendees.filter(a => !a.email?.includes("calendar.google.com")).length - 3}`}
              </span>
            )}
          </div>
        </div>
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`shrink-0 p-1.5 rounded-lg hover:bg-background/50 transition-colors ${textColor}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Recent emails from attendees */}
      {attendeeEmails.length > 0 && (
        <div className="rounded-xl bg-background/50 border border-border/30 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> Recent from attendees
          </p>
          {attendeeEmails.map(email => (
            <button
              key={email.id}
              onClick={() => navigate("/email")}
              className="w-full text-left group"
            >
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  email.category === "urgent" ? "bg-destructive" :
                  email.category === "needs_reply" ? "bg-accent" : "bg-muted-foreground/40"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate group-hover:text-accent transition-colors">
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {email.from_name || email.from_address} · {formatTime(email.received_at)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Event row in schedule ────────────────────────────────────────────────────

function EventRow({ event, isNow, isPast }: { event: TodayEvent; isNow: boolean; isPast: boolean }) {
  return (
    <div className={`flex items-start gap-3 py-2 transition-opacity ${isPast ? "opacity-40" : ""}`}>
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <span className="text-xs text-muted-foreground w-16 text-right">{formatTime(event.start)}</span>
      </div>
      <div className="relative flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${isNow ? "bg-green-500" : isPast ? "bg-muted-foreground/40" : "bg-accent"}`} />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <p className={`text-sm font-medium truncate ${isNow ? "text-foreground" : "text-foreground/80"}`}>
          {event.summary}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{formatDuration(event.start, event.end)}</span>
          {event.location && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">· {event.location}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon, count, label, color, onClick,
}: {
  icon: React.ElementType;
  count: number;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/60 border border-border/40 hover:border-accent/30 hover:bg-accent/5 transition-all group"
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-sm font-semibold text-foreground">{count}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-accent transition-colors ml-auto" />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TodayCommandCenter() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const {
    todayEvents,
    nextMeeting,
    minutesUntilNext,
    isInMeeting,
    urgentEmailCount,
    needsReplyCount,
    overdueTaskCount,
    dueTodayCount,
    suggestedTaskCount,
    loading,
  } = useTodayData();

  // Pre-meeting intelligence — fetch recent emails from attendees
  const [attendeeEmails, setAttendeeEmails] = useState<AttendeeEmail[]>([]);
  useEffect(() => {
    if (!nextMeeting || minutesUntilNext === null || minutesUntilNext > 30 || minutesUntilNext < 0) {
      setAttendeeEmails([]);
      return;
    }
    const emails = nextMeeting.attendees
      .filter(a => a.email && !a.email.includes("calendar.google.com"))
      .map(a => a.email);
    if (emails.length === 0) return;

    supabase
      .from("email_metadata")
      .select("id, subject, from_name, from_address, received_at, ai_summary, category")
      .in("from_address", emails)
      .order("received_at", { ascending: false })
      .limit(3)
      .then(({ data }) => { if (data) setAttendeeEmails(data as AttendeeEmail[]); });
  }, [nextMeeting?.id, minutesUntilNext]);

  // Post-meeting capture — detect meeting that ended in last 30 min
  const recentlyEndedMeeting = todayEvents.find(e => {
    const endMs = new Date(e.end).getTime();
    const nowMs = Date.now();
    return endMs <= nowMs && nowMs - endMs <= 30 * 60_000;
  });
  const [captureDismissed, setCaptureDismissed] = useState<string | null>(null);

  const now = new Date();
  const todayStr = format(now, "EEEE, MMMM d");

  const showPrepCard = nextMeeting !== null &&
    minutesUntilNext !== null &&
    minutesUntilNext <= 30 &&
    !isInMeeting;
  const showInProgress = nextMeeting !== null && isInMeeting;

  const { label: countdownLabel_, color: countdownColor, pulse } = countdownLabel(minutesUntilNext, isInMeeting);

  const pastEventIds = new Set(
    todayEvents
      .filter(e => new Date(e.end).getTime() < now.getTime())
      .map(e => e.id)
  );
  const nowEventId = todayEvents.find(
    e => new Date(e.start).getTime() <= now.getTime() && new Date(e.end).getTime() > now.getTime()
  )?.id;

  const totalAlerts = urgentEmailCount + overdueTaskCount;

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 animate-pulse space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-24" />
        </div>
        <div className="h-12 bg-muted rounded-xl w-full" />
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <div key={i} className="h-10 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden" style={{ animation: "fade-up 0.3s ease-out both" }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Today's Focus</h2>
              <p className="text-[11px] text-muted-foreground">{todayStr}</p>
            </div>
          </div>
          {totalAlerts > 0 && (
            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-destructive/10 text-destructive">
              {totalAlerts} need attention
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* Post-meeting capture nudge */}
        {recentlyEndedMeeting && recentlyEndedMeeting.id !== captureDismissed && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4" style={{ animation: "fade-up 0.3s ease-out both" }}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {recentlyEndedMeeting.summary} just ended
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Capture notes and action items while it's fresh.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => navigate("/tasks")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    <PenLine className="w-3 h-3" />
                    Add action items
                  </button>
                  <button
                    onClick={() => setCaptureDismissed(recentlyEndedMeeting.id)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pre-meeting / in-progress card */}
        {(showPrepCard || showInProgress) && nextMeeting && minutesUntilNext !== null && (
          <PreMeetingCard
            event={nextMeeting}
            minutesUntil={minutesUntilNext}
            attendeeEmails={attendeeEmails}
          />
        )}

        {/* Next meeting if not in prep window */}
        {nextMeeting && !showPrepCard && !showInProgress && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30">
            <Clock className="w-4 h-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{nextMeeting.summary}</p>
              <p className="text-xs text-muted-foreground">{formatTime(nextMeeting.start)}</p>
            </div>
            <span className={`text-sm font-semibold shrink-0 ${countdownColor} ${pulse ? "animate-pulse" : ""}`}>
              {countdownLabel_}
            </span>
          </div>
        )}

        {/* No meetings */}
        {todayEvents.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <Calendar className="w-4 h-4" />
            No meetings today — clear runway to focus
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill
            icon={AlertTriangle}
            count={urgentEmailCount}
            label="Urgent"
            color="text-destructive"
            onClick={() => navigate("/email")}
          />
          <StatPill
            icon={MessageSquareReply}
            count={needsReplyCount}
            label="Reply"
            color="text-accent"
            onClick={() => navigate("/email")}
          />
          <StatPill
            icon={CheckCircle2}
            count={overdueTaskCount + dueTodayCount}
            label="Tasks"
            color={overdueTaskCount > 0 ? "text-destructive" : "text-muted-foreground"}
            onClick={() => navigate("/tasks")}
          />
          <StatPill
            icon={Calendar}
            count={todayEvents.length}
            label="Meetings"
            color="text-muted-foreground"
            onClick={() => navigate("/calendar")}
          />
        </div>

        {/* Today's schedule */}
        {todayEvents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Today's Schedule
              </p>
              <button
                onClick={() => navigate("/calendar")}
                className="text-[11px] text-accent hover:underline flex items-center gap-0.5"
              >
                Full calendar <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-0">
              {todayEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  isNow={event.id === nowEventId}
                  isPast={pastEventIds.has(event.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Suggested tasks nudge */}
        {suggestedTaskCount > 0 && (
          <button
            onClick={() => navigate("/tasks")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/5 border border-accent/20 text-left hover:bg-accent/10 transition-colors group"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
            <p className="text-xs text-foreground flex-1">
              <span className="font-semibold">{suggestedTaskCount} task{suggestedTaskCount > 1 ? "s" : ""}</span>
              {" "}suggested by {agentName} — review &amp; approve
            </p>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
          </button>
        )}
      </div>
    </div>
  );
}