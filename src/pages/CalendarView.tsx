import { useState, useEffect, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronLeft, ChevronRight, X, Send, Mic, MicOff, Sparkles, Loader2, Calendar, RefreshCw, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { VoiceWaveform } from "@/components/VoiceWaveform";

import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { PriorityLegend } from "@/components/PriorityLegend";
import { ReconnectBanner } from "@/components/ReconnectBanner";
import { NotConnectedState } from "@/components/NotConnectedState";

interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string;
  attendees: { email: string; responseStatus: string; displayName?: string }[];
  status: string;
  htmlLink: string;
}

const eventColors = [
  "bg-accent",
  "bg-priority-important",
  "bg-priority-low",
  "bg-priority-urgent",
];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDuration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

// Always use LOCAL date so IST/non-UTC users see events on the correct day
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateKey(iso: string): string {
  try {
    return toLocalDateStr(new Date(iso));
  } catch {
    return iso;
  }
}

function getDayOfMonth(iso: string): number {
  try {
    return new Date(iso).getDate();
  } catch {
    return 0;
  }
}

export default function CalendarView() {
  const navigate = useNavigate();
  const { isConnected } = useIntegrations();
  const { agentName } = useAgent();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);   // 0 = current week, +1 = next, -1 = prev
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notifyAttendees, setNotifyAttendees] = useState(true);
  const [cancelMessage, setCancelMessage] = useState("");
  const [createForm, setCreateForm] = useState({
    summary: "",
    date: toLocalDateStr(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    location: "",
    allDay: false,
  });
  const annieChat = useAnnieChat(agentName);
  const speech = useSpeechRecognition({
    onResult: (text) => setAgentInput((prev) => (prev ? prev + " " : "") + text),
  });

  const calendarConnected = isConnected("google-calendar");

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    speech.stopListening();
    annieChat.send(agentInput.trim());
    setAgentInput("");
  };


  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("calendar-fetch", {
        body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });

      // Try to parse the response body even when supabase-js flags a non-2xx status
      let payload: any = data;
      if (fnError && (fnError as any).context instanceof Response) {
        try {
          payload = await (fnError as any).context.clone().json();
        } catch {
          payload = null;
        }
      }

      if (payload?.code === "RECONNECT_REQUIRED" || payload?.error === "RECONNECT_REQUIRED") {
        setNeedsReconnect(true);
        return;
      }

      if (fnError) throw fnError;
      if (payload?.error) throw new Error(payload.error);
      setEvents(payload?.events || []);
    } catch (err: any) {
      console.error("Failed to fetch calendar:", err);
      setError(err.message || "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  const createEvent = useCallback(async () => {
    if (!createForm.summary.trim()) return;
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Parse as local time (no tz suffix = browser local), then send as UTC ISO.
      // Without this, Deno (UTC) would misinterpret "09:00" as UTC instead of IST.
      const start = createForm.allDay
        ? createForm.date
        : new Date(`${createForm.date}T${createForm.startTime}:00`).toISOString();
      const end = createForm.allDay
        ? undefined
        : new Date(`${createForm.date}T${createForm.endTime}:00`).toISOString();

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-event-create`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: createForm.summary.trim(),
            location: createForm.location.trim() || undefined,
            start,
            end,
            allDay: createForm.allDay,
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed to create event");

      setCreateSheetOpen(false);
      setCreateForm({ summary: "", date: toLocalDateStr(new Date()), startTime: "09:00", endTime: "10:00", location: "", allDay: false });
      fetchEvents();
    } catch (err: any) {
      console.error("Create event error:", err);
    } finally {
      setCreating(false);
    }
  }, [createForm, fetchEvents]);

  const cancelEvent = useCallback(async () => {
    if (!selectedEvent) return;
    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-event-delete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ eventId: selectedEvent.id, notifyAttendees, message: cancelMessage.trim() || undefined }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed to cancel event");
      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
      setSelectedEvent(null);
      setConfirmCancel(false);
      setCancelMessage("");
    } catch (err: any) {
      console.error("Cancel event error:", err);
    } finally {
      setCancelling(false);
    }
  }, [selectedEvent, notifyAttendees, cancelMessage]);

  useEffect(() => {
    if (calendarConnected) fetchEvents();
  }, [calendarConnected, fetchEvents]);

  useEffect(() => {
    if (!calendarConnected) return;
    let lastFetchTs = Date.now();
    const maybeRefresh = () => {
      if (Date.now() - lastFetchTs > 30_000) {
        lastFetchTs = Date.now();
        fetchEvents();
      }
    };
    const onVisibility = () => { if (!document.hidden) maybeRefresh(); };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [calendarConnected, fetchEvents]);

  const now = new Date();
  // Use LOCAL date string everywhere — fixes off-by-one for non-UTC timezones
  const today = toLocalDateStr(now);
  const todayEvents = events.filter((e) => getDateKey(e.start) === today);
  const upcomingEvents = events.filter((e) => getDateKey(e.start) > today);

  // Group events by date key (includes today + upcoming for selected day filtering)
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = getDateKey(e.start);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const upcomingByDate = upcomingEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = getDateKey(e.start);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  // Week navigation — offset by weekOffset weeks from today's Monday
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + mondayOffset + weekOffset * 7);

  // Month navigation
  const displayMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);

  // Navigation header label tracks the actual visible date range per view
  const navAnchor = view === "month" ? displayMonth : view === "week" ? startOfWeek : now;
  const currentMonth = navAnchor.toLocaleDateString([], { month: "long", year: "numeric" });

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const getColorForEvent = (index: number) => eventColors[index % eventColors.length];

  const EventCard = ({ event, index }: { event: CalendarEvent; index: number }) => {
    const participants = event.attendees
      .filter((a) => !a.email?.includes("calendar.google.com"))
      .map((a) => a.displayName || a.email.split("@")[0]);

    return (
      <button
        onClick={() => setSelectedEvent(event)}
        className="w-full text-left flex items-center gap-3 bg-background border rounded-xl p-4 hover:shadow-md hover:border-accent/30 transition-all"
      >
        <div className={`w-1 h-10 rounded-full ${getColorForEvent(index)}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{event.summary}</p>
          <p className="text-xs text-muted-foreground">
            {formatTime(event.start)} · {formatDuration(event.start, event.end)}
            {event.location && ` · ${event.location}`}
          </p>
        </div>
        {participants.length > 0 && (
          <div className="flex -space-x-2">
            {participants.slice(0, 3).map((p) => (
              <div key={p} className="w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-medium">
                {p.charAt(0).toUpperCase()}
              </div>
            ))}
            {participants.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                +{participants.length - 3}
              </div>
            )}
          </div>
        )}
      </button>
    );
  };

  // Not connected state
  if (!calendarConnected) {
    return (
      <div className="min-h-screen bg-background flex flex-col pt-[var(--header-h)]">
        <nav className="border-b bg-background sticky top-[var(--header-h)] z-50">
          <div className="container flex items-center justify-between h-14 px-4">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Admin</span>
            </button>
            <h1 className="font-display font-semibold">Calendar</h1>
            <div className="w-8" />
          </div>
        </nav>
        <NotConnectedState integration="calendar" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--header-h)]">
      <nav className="border-b bg-background sticky top-[var(--header-h)] z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Admin</span>
          </button>
          <h1 className="font-display font-semibold">Calendar</h1>
          <div className="flex items-center gap-2">
            <button onClick={fetchEvents} disabled={loading} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setCreateSheetOpen(true)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Reconnect banner */}
      {needsReconnect && (
        <div className="container max-w-3xl py-4">
          <ReconnectBanner service="google-calendar" />
        </div>
      )}

      {/* Priority legend */}
      {!loading && !error && !needsReconnect && events.length > 0 && <PriorityLegend />}

      <div className="border-b bg-card">
        <div className="container px-4 flex items-center gap-2 py-3">
          {/* Month/week navigation — takes remaining space, won't overflow */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <button
              onClick={() => { view === "week" ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1); setSelectedDate(null); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-display font-semibold text-sm sm:text-base text-center flex-1 truncate">
              {currentMonth}
            </span>
            <button
              onClick={() => {
                if (view === "week" && weekOffset < 8) { setWeekOffset(o => o + 1); setSelectedDate(null); }
                else if (view === "month" && monthOffset < 2) { setMonthOffset(o => o + 1); setSelectedDate(null); }
              }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted shrink-0 disabled:opacity-30"
              disabled={(view === "week" && weekOffset >= 8) || (view === "month" && monthOffset >= 2)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {(weekOffset !== 0 || monthOffset !== 0) && (
              <button
                onClick={() => { setWeekOffset(0); setMonthOffset(0); setSelectedDate(null); }}
                className="text-xs text-accent hover:underline shrink-0 px-1"
              >
                Today
              </button>
            )}
          </div>
          {/* View switcher — fixed width, never shrinks */}
          <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setSelectedDate(null); }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && events.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Loading your calendar...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <X className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-foreground font-medium mb-2">Failed to load calendar</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <Button onClick={fetchEvents} variant="outline">Try again</Button>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <div className="flex-1 container py-4 max-w-3xl">
          {view === "day" && (
            <>
              <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
                {formatDate(new Date().toISOString())}
              </h2>
              <div className="space-y-2">
                {todayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">No events today.</p>
                ) : (
                  todayEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />)
                )}
              </div>
            </>
          )}

          {view === "week" && (
            <>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {weekDays.map((day, i) => {
                  const d = weekDates[i];
                  const dateStr = toLocalDateStr(d);
                  const isToday = dateStr === today;
                  const isSelected = selectedDate === dateStr;
                  const dayHasEvents = events.some((e) => getDateKey(e.start) === dateStr);
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className="text-center group focus:outline-none"
                    >
                      <p className="text-xs text-muted-foreground mb-1">{day}</p>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-medium transition-colors ${
                        isSelected ? "bg-foreground text-background" :
                        isToday ? "bg-accent text-accent-foreground" :
                        "group-hover:bg-muted"
                      }`}>
                        {d.getDate()}
                      </div>
                      {dayHasEvents && !isSelected && !isToday && (
                        <div className="w-1 h-1 rounded-full bg-accent mx-auto mt-1" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDate ? (
                <div className="mb-6">
                  <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
                    {formatDate(new Date(selectedDate + "T12:00:00").toISOString())}
                  </h2>
                  <div className="space-y-2">
                    {(() => {
                      const dayEvents = eventsByDate[selectedDate] || [];
                      if (dayEvents.length === 0) {
                        return <p className="text-sm text-muted-foreground py-6 text-center">No events on this day.</p>;
                      }
                      return dayEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />);
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  {todayEvents.length > 0 && (
                    <div className="mb-6">
                      <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">Today — {formatDate(new Date().toISOString())}</h2>
                      <div className="space-y-2">
                        {todayEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                      </div>
                    </div>
                  )}

                  {Object.keys(upcomingByDate).length > 0 && (
                    <div>
                      <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">Upcoming</h2>
                      <div className="space-y-4">
                        {Object.entries(upcomingByDate).map(([dateKey, dayEvents]) => (
                          <div key={dateKey}>
                            <p className="text-xs text-muted-foreground mb-2">{formatDate(dayEvents[0].start)}</p>
                            <div className="space-y-2">
                              {dayEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {todayEvents.length === 0 && upcomingEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground py-10 text-center">No upcoming events this week.</p>
                  )}
                </>
              )}
            </>
          )}

          {view === "month" && (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {/* Previous month padding */}
                {(() => {
                  const firstDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1).getDay();
                  const padding = firstDay === 0 ? 6 : firstDay - 1;
                  const prevMonthDays = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 0).getDate();
                  return Array.from({ length: padding }, (_, i) => (
                    <div key={`prev-${i}`} className="aspect-square rounded-lg p-1 text-muted-foreground/40">
                      <span className="text-xs">{prevMonthDays - padding + 1 + i}</span>
                    </div>
                  ));
                })()}
                {/* Current month days */}
                {Array.from({ length: new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((d) => {
                  const dateStr = `${displayMonth.getFullYear()}-${String(displayMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const dayEvents = eventsByDate[dateStr] || [];
                  const isToday = dateStr === today;
                  const isSelected = selectedDate === dateStr;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`aspect-square rounded-lg p-1 border transition-colors hover:border-accent/30 text-left overflow-hidden ${
                        isSelected ? "bg-foreground/10 border-foreground/40" :
                        isToday ? "bg-accent/10 border-accent/30" :
                        "border-transparent"
                      }`}
                    >
                      <span className={`text-xs font-medium leading-none ${isToday ? "text-accent" : ""}`}>{d}</span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5 overflow-hidden">
                          {dayEvents.slice(0, 3).map((e, i) => (
                            <div key={e.id} className={`w-1.5 h-1.5 rounded-full shrink-0 ${getColorForEvent(i)}`} />
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <div className="mt-6">
                  <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
                    {formatDate(new Date(selectedDate + "T12:00:00").toISOString())}
                  </h2>
                  <div className="space-y-2">
                    {(() => {
                      const dayEvents = eventsByDate[selectedDate] || [];
                      if (dayEvents.length === 0) {
                        return <p className="text-sm text-muted-foreground py-6 text-center">No events on this day.</p>;
                      }
                      return dayEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} />);
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Event Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => { setSelectedEvent(null); setConfirmCancel(false); setNotifyAttendees(true); setCancelMessage(""); }}>
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-3 h-3 rounded-full mt-1 bg-accent" />
                <button onClick={() => { setSelectedEvent(null); setConfirmCancel(false); setNotifyAttendees(true); setCancelMessage(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <h2 className="font-display text-xl font-semibold mb-1">{selectedEvent.summary}</h2>
              <p className="text-sm text-muted-foreground mb-1">
                {formatDate(selectedEvent.start)}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {formatTime(selectedEvent.start)} – {formatTime(selectedEvent.end)} · {formatDuration(selectedEvent.start, selectedEvent.end)}
              </p>

              {selectedEvent.location && (
                <p className="text-sm text-muted-foreground mb-4">📍 {selectedEvent.location}</p>
              )}

              {selectedEvent.description && (
                <div className="bg-card border rounded-xl p-3 mb-4 text-sm text-foreground/80 whitespace-pre-line line-clamp-4">
                  {selectedEvent.description.replace(/<[^>]*>/g, "")}
                </div>
              )}

              {selectedEvent.attendees.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-medium mb-2">Participants</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEvent.attendees
                      .filter((a) => !a.email?.includes("calendar.google.com"))
                      .map((a) => (
                        <span key={a.email} className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm">
                          {a.displayName || a.email.split("@")[0]}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {confirmCancel ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-destructive">Cancel this event?</p>
                  <textarea
                    value={cancelMessage}
                    onChange={(e) => setCancelMessage(e.target.value)}
                    placeholder="Add a message to attendees (optional)"
                    rows={3}
                    disabled={cancelling}
                    className="w-full text-sm bg-background border border-border/60 rounded-xl px-3 py-2 resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-destructive/40 disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyAttendees}
                      onChange={(e) => setNotifyAttendees(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                    />
                    Notify attendees
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={cancelling}
                      onClick={cancelEvent}
                    >
                      {cancelling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelling…</> : "Yes, Cancel Event"}
                    </Button>
                    <Button variant="outline" onClick={() => { setConfirmCancel(false); setCancelMessage(""); }} disabled={cancelling}>
                      Never mind
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {selectedEvent.htmlLink && (
                      <Button variant="outline" className="flex-1" asChild>
                        <a href={selectedEvent.htmlLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" /> Open in Calendar
                        </a>
                      </Button>
                    )}
                    <Button onClick={() => { setSelectedEvent(null); setAgentSheetOpen(true); }} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
                      <Sparkles className="w-4 h-4 mr-2" /> Ask {agentName}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Cancel Event
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Bottom Sheet */}
      <AnimatePresence>
        {agentSheetOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/40 flex items-end justify-center" onClick={() => setAgentSheetOpen(false)}>
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full max-w-lg rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold">{agentName.charAt(0)}</div>
                <p className="font-display font-semibold">What can I handle for you?</p>
              </div>
              {annieChat.messages.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 mb-3 px-1">
                  {annieChat.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"}`}>{msg.text}</div>
                    </div>
                  ))}
                  {annieChat.thinking && (
                    <div className="flex justify-start">
                      <div className="bg-secondary text-secondary-foreground rounded-2xl px-3 py-2 text-sm"><span className="animate-pulse">Thinking…</span></div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={agentInput} onChange={(e) => setAgentInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAgentSend()} placeholder={`Tell ${agentName} what to do...`} className="flex-1" />
                <VoiceWaveform isActive={speech.isListening} />
                <Button size="icon" variant="ghost" onClick={speech.toggleListening} className={speech.isListening ? "text-destructive" : ""}>
                  {speech.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleAgentSend}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedEvent && !agentSheetOpen && (
        <button
          onClick={() => setAgentSheetOpen(true)}
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 flex items-center justify-center hover:scale-105 transition-transform z-40"
        >
          <span className="font-display font-bold text-lg">{agentName.charAt(0)}</span>
        </button>
      )}

      {/* Create Event Sheet */}
      <AnimatePresence>
        {createSheetOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => setCreateSheetOpen(false)}>
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4 sm:hidden" />
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-semibold text-lg">New Event</h2>
                <button onClick={() => setCreateSheetOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="evt-title" className="text-xs text-muted-foreground mb-1.5 block">Title *</Label>
                  <Input id="evt-title" placeholder="Event title" value={createForm.summary} onChange={(e) => setCreateForm((p) => ({ ...p, summary: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="evt-date" className="text-xs text-muted-foreground mb-1.5 block">Date</Label>
                  <Input id="evt-date" type="date" value={createForm.date} onChange={(e) => setCreateForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="evt-allday" checked={createForm.allDay} onChange={(e) => setCreateForm((p) => ({ ...p, allDay: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                  <Label htmlFor="evt-allday" className="text-sm cursor-pointer">All day</Label>
                </div>
                {!createForm.allDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="evt-start" className="text-xs text-muted-foreground mb-1.5 block">Start time</Label>
                      <Input id="evt-start" type="time" value={createForm.startTime} onChange={(e) => setCreateForm((p) => ({ ...p, startTime: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="evt-end" className="text-xs text-muted-foreground mb-1.5 block">End time</Label>
                      <Input id="evt-end" type="time" value={createForm.endTime} onChange={(e) => setCreateForm((p) => ({ ...p, endTime: e.target.value }))} />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="evt-loc" className="text-xs text-muted-foreground mb-1.5 block">Location</Label>
                  <Input id="evt-loc" placeholder="Optional" value={createForm.location} onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <Button onClick={createEvent} disabled={creating || !createForm.summary.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create Event"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
