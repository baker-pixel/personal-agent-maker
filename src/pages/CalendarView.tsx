import { useState, useEffect, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronLeft, ChevronRight, X, Send, Mic, MicOff, Sparkles, Loader2, Calendar, RefreshCw, ExternalLink } from "lucide-react";
import { VoiceWaveform } from "@/components/VoiceWaveform";

import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { PriorityLegend } from "@/components/PriorityLegend";
import { ReconnectBanner } from "@/components/ReconnectBanner";

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

function getDateKey(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
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
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
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
      const { data, error: fnError } = await supabase.functions.invoke("calendar-fetch");
      if (fnError) throw fnError;
      if (data?.code === "RECONNECT_REQUIRED") {
        setNeedsReconnect(true);
        return;
      }
      if (data?.error) throw new Error(data.error);
      setEvents(data?.events || []);
    } catch (err: any) {
      console.error("Failed to fetch calendar:", err);
      setError(err.message || "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (calendarConnected) fetchEvents();
  }, [calendarConnected, fetchEvents]);

  // Group events by date
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((e) => getDateKey(e.start) === today);
  const upcomingEvents = events.filter((e) => getDateKey(e.start) > today);

  // Group upcoming by date
  const upcomingByDate = upcomingEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = getDateKey(e.start);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const now = new Date();
  const currentMonth = now.toLocaleDateString([], { month: "long", year: "numeric" });

  // Week header
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(now.getDate() + mondayOffset);

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
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="container flex items-center justify-between h-14 px-4">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Admin</span>
            </button>
            <h1 className="font-display font-semibold">Calendar</h1>
            <div className="w-8" />
          </div>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <Calendar className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">Connect Calendar</h2>
            <p className="text-muted-foreground mb-4">
              Connect your Google Calendar in Settings to view and manage your schedule here.
            </p>
            <Button onClick={() => navigate("/settings")} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Go to Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
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
        <div className="container flex items-center justify-between py-3">
          <span className="font-display font-semibold">{currentMonth}</span>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
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
                  const isToday = d.toISOString().slice(0, 10) === today;
                  return (
                    <div key={day} className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">{day}</p>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-medium ${isToday ? "bg-accent text-accent-foreground" : ""}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

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
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
                  const padding = firstDay === 0 ? 6 : firstDay - 1;
                  const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
                  return Array.from({ length: padding }, (_, i) => (
                    <div key={`prev-${i}`} className="aspect-square rounded-lg p-1 text-muted-foreground/40">
                      <span className="text-xs">{prevMonthDays - padding + 1 + i}</span>
                    </div>
                  ));
                })()}
                {/* Current month */}
                {Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((d) => {
                  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const dayEvents = events.filter((e) => getDateKey(e.start) === dateStr);
                  const isToday = dateStr === today;
                  return (
                    <div key={d} className={`aspect-square rounded-lg p-1 border transition-colors hover:border-accent/30 cursor-pointer ${isToday ? "bg-accent/10 border-accent/30" : "border-transparent"}`}>
                      <span className={`text-xs font-medium ${isToday ? "text-accent" : ""}`}>{d}</span>
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {dayEvents.map((e, i) => (
                          <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${getColorForEvent(i)}`} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Event Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => setSelectedEvent(null)}>
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-3 h-3 rounded-full mt-1 bg-accent" />
                <button onClick={() => setSelectedEvent(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
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
              className="bg-background w-full max-w-lg rounded-t-2xl p-6"
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
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 flex items-center justify-center hover:scale-105 transition-transform z-40"
        >
          <span className="font-display font-bold text-lg">{agentName.charAt(0)}</span>
        </button>
      )}
    </div>
  );
}
