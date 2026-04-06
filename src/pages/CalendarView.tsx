import { useState, useEffect } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronLeft, ChevronRight, X, Send, Mic, MicOff, Sparkles } from "lucide-react";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import AppMenu from "@/components/AppMenu";

interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  duration: string;
  participants: string[];
  day: number;
  color: string;
}

const mockEvents: CalendarEvent[] = [
  { id: "1", title: "Team standup", time: "9:00 AM", duration: "30 min", participants: ["Sarah C.", "Tom R."], day: 3, color: "bg-accent" },
  { id: "2", title: "Client review — Acme Design", time: "11:00 AM", duration: "1 hr", participants: ["Sarah Chen", "Maria Lopez"], day: 3, color: "bg-priority-important" },
  { id: "3", title: "Lunch with James", time: "12:30 PM", duration: "1 hr", participants: ["James Park"], day: 3, color: "bg-priority-low" },
  { id: "4", title: "Q2 planning session", time: "2:00 PM", duration: "2 hr", participants: ["Full team"], day: 4, color: "bg-accent" },
  { id: "5", title: "Vendor call — SupplierCo", time: "10:00 AM", duration: "45 min", participants: ["Tom Rivera"], day: 5, color: "bg-priority-important" },
  { id: "6", title: "Marketing brainstorm", time: "3:00 PM", duration: "1 hr", participants: ["Creative team"], day: 7, color: "bg-priority-low" },
];

export default function CalendarView() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Annie");
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const annieChat = useAnnieChat(agentName);
  const speech = useSpeechRecognition({
    onResult: (text) => setAgentInput((prev) => (prev ? prev + " " : "") + text),
  });

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    speech.stopListening();
    annieChat.send(agentInput.trim());
    setAgentInput("");
  };

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try { setAgentName(JSON.parse(stored).agentName || "Annie"); } catch {}
    }
  }, []);

  const currentMonth = "April 2026";
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDates = [30, 31, 1, 2, 3, 4, 5];
  const todayEvents = mockEvents.filter((e) => e.day === 3);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Admin</span>
          </button>
          <h1 className="font-display font-semibold">Calendar</h1>
          <AppMenu />
        </div>
      </nav>

      <div className="border-b bg-card">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <button className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
            <span className="font-display font-semibold">{currentMonth}</span>
            <button className="text-muted-foreground hover:text-foreground"><ChevronRight className="w-5 h-5" /></button>
          </div>
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

      <div className="flex-1 container py-4 max-w-3xl">
        {view === "day" && (
          <>
            <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">Thursday, April 3</h2>
            <div className="space-y-2">
              {todayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No events today.</p>
              ) : (
                todayEvents.map((event) => (
                  <button key={event.id} onClick={() => setSelectedEvent(event)} className="w-full text-left flex items-center gap-3 bg-background border rounded-xl p-4 hover:shadow-md hover:border-accent/30 transition-all">
                    <div className={`w-1 h-10 rounded-full ${event.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.time} · {event.duration}</p>
                    </div>
                    <div className="flex -space-x-2">
                      {event.participants.slice(0, 2).map((p) => (
                        <div key={p} className="w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-medium">{p.charAt(0)}</div>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {view === "week" && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weekDays.map((day, i) => (
                <div key={day} className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{day}</p>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-sm font-medium ${weekDates[i] === 3 ? "bg-accent text-accent-foreground" : ""}`}>
                    {weekDates[i]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mb-6">
              <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">Today — Thursday, April 3</h2>
              <div className="space-y-2">
                {todayEvents.map((event) => (
                  <button key={event.id} onClick={() => setSelectedEvent(event)} className="w-full text-left flex items-center gap-3 bg-background border rounded-xl p-4 hover:shadow-md hover:border-accent/30 transition-all">
                    <div className={`w-1 h-10 rounded-full ${event.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.time} · {event.duration}</p>
                    </div>
                    <div className="flex -space-x-2">
                      {event.participants.slice(0, 2).map((p) => (
                        <div key={p} className="w-6 h-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs font-medium">{p.charAt(0)}</div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">Upcoming</h2>
              <div className="space-y-2">
                {mockEvents.filter((e) => e.day > 3).map((event) => (
                  <button key={event.id} onClick={() => setSelectedEvent(event)} className="w-full text-left flex items-center gap-3 bg-background border rounded-xl p-4 hover:shadow-md hover:border-accent/30 transition-all">
                    <div className={`w-1 h-10 rounded-full ${event.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-muted-foreground">Apr {event.day} · {event.time} · {event.duration}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
              {[30, 31].map((d) => (
                <div key={`prev-${d}`} className="aspect-square rounded-lg p-1 text-muted-foreground/40">
                  <span className="text-xs">{d}</span>
                </div>
              ))}
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
                const dayEvents = mockEvents.filter((e) => e.day === d);
                return (
                  <div key={d} className={`aspect-square rounded-lg p-1 border transition-colors hover:border-accent/30 cursor-pointer ${d === 3 ? "bg-accent/10 border-accent/30" : "border-transparent"}`}>
                    <span className={`text-xs font-medium ${d === 3 ? "text-accent" : ""}`}>{d}</span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayEvents.map((e) => (
                        <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${e.color}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

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
                <div className={`w-3 h-3 rounded-full mt-1 ${selectedEvent.color}`} />
                <button onClick={() => setSelectedEvent(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <h2 className="font-display text-xl font-semibold mb-1">{selectedEvent.title}</h2>
              <p className="text-sm text-muted-foreground mb-4">{selectedEvent.time} · {selectedEvent.duration}</p>
              <div className="mb-6">
                <p className="text-sm font-medium mb-2">Participants</p>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.participants.map((p) => (
                    <span key={p} className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm">{p}</span>
                  ))}
                </div>
              </div>
              <Button onClick={() => { setSelectedEvent(null); setAgentSheetOpen(true); }} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <Sparkles className="w-4 h-4 mr-2" /> Ask {agentName}
              </Button>
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
