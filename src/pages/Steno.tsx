import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mic, Square, Loader2, Sparkles, Trash2, CheckCircle2, ListTodo, Bell, Cake, Repeat, CalendarDays, Lightbulb } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAgent } from "@/contexts/AgentContext";

type ItemType = "task" | "reminder" | "contact_reminder" | "followup" | "calendar_event" | "key_point";

interface ExtractedItem {
  id: string; // local id for editing
  type: ItemType;
  title: string;
  description?: string;
  due_date?: string;
  priority?: "low" | "medium" | "high";
  remind_at?: string;
  contact_name?: string;
  reminder_date?: string;
  reminder_type?: string;
  recurring?: boolean;
  event_date?: string;
  event_time?: string;
  event_end_time?: string;
  location?: string;
  all_day?: boolean;
}

const TYPE_META: Record<ItemType, { label: string; icon: typeof ListTodo; tint: string }> = {
  calendar_event: { label: "Event", icon: CalendarDays, tint: "text-violet-600 bg-violet-500/10 border-violet-500/20" },
  task: { label: "Task", icon: ListTodo, tint: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  reminder: { label: "Reminder", icon: Bell, tint: "text-orange-600 bg-orange-500/10 border-orange-500/20" },
  contact_reminder: { label: "Contact", icon: Cake, tint: "text-rose-600 bg-rose-500/10 border-rose-500/20" },
  followup: { label: "Follow-up", icon: Repeat, tint: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  key_point: { label: "Key point", icon: Lightbulb, tint: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
};

export default function Steno() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const transcriptRef = useRef("");

  const speech = useSpeechRecognition({
    continuous: true,
    onResult: (final) => {
      const next = (transcriptRef.current + " " + final).trim();
      transcriptRef.current = next;
      setTranscript(next);
      setInterim("");
    },
  });

  // Mirror interim transcript for live display
  useEffect(() => {
    if (speech.isListening && speech.transcript) setInterim(speech.transcript);
  }, [speech.transcript, speech.isListening]);

  const handleExtract = useCallback(async () => {
    const text = transcriptRef.current.trim();
    if (!text) {
      toast.error("Nothing to capture yet — start talking first.");
      return;
    }
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("steno-extract", {
        body: { transcript: text },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const extracted: ExtractedItem[] = (data?.items || []).map((it: Omit<ExtractedItem, "id">, i: number) => ({
        ...it,
        id: `${Date.now()}-${i}`,
      }));
      setItems(extracted);
      if (extracted.length === 0) {
        toast.info("No structured items found in that transcript.");
      } else {
        toast.success(`Captured ${extracted.length} item${extracted.length === 1 ? "" : "s"} — review below.`);
      }
    } catch (e) {
      console.error("[Steno] extract failed", e);
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, []);

  const updateItem = (id: string, patch: Partial<ExtractedItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSaveAll = useCallback(async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // 1) Persist the Steno session (transcript + AI summary) so it can be recalled later
      const transcriptText = transcriptRef.current.trim() || transcript.trim();
      let sessionId: string | null = null;

      // Collect key points from extracted items so we can store them with the session
      const extractedKeyPoints: string[] = items
        .filter((it) => it.type === "key_point" && it.title?.trim())
        .map((it) => it.title.trim());

      if (transcriptText) {
        let title = "Steno session";
        let summary = "";
        let topics: string[] = [];
        let attendees: string[] = [];
        let location = "";
        let summaryKeyPoints: string[] = [];
        try {
          const { data: sumData } = await supabase.functions.invoke("steno-summarize", {
            body: { transcript: transcriptText },
          });
          if (sumData && !sumData.error) {
            title = sumData.title || title;
            summary = sumData.summary || "";
            topics = Array.isArray(sumData.topics) ? sumData.topics : [];
            attendees = Array.isArray(sumData.attendees) ? sumData.attendees : [];
            location = sumData.location || "";
            summaryKeyPoints = Array.isArray(sumData.key_points) ? sumData.key_points : [];
          }
        } catch (e) {
          console.warn("[Steno] summarize failed, saving without summary", e);
        }

        // Merge key points from extractor + summarizer, dedupe (case-insensitive)
        const seen = new Set<string>();
        const mergedKeyPoints: string[] = [];
        for (const kp of [...extractedKeyPoints, ...summaryKeyPoints]) {
          const norm = kp.trim().toLowerCase();
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            mergedKeyPoints.push(kp.trim());
          }
        }

        const { data: sessRow, error: sessErr } = await supabase
          .from("steno_sessions")
          .insert({
            user_id: user.id,
            title,
            transcript: transcriptText,
            summary: summary || null,
            topics,
            attendees,
            location: location || null,
            key_points: mergedKeyPoints,
            item_count: items.length,
            session_date: new Date().toISOString().slice(0, 10),
          } as any)
          .select("id")
          .single();
        if (sessErr) {
          console.error("[Steno] session save failed", sessErr);
        } else {
          sessionId = (sessRow as any)?.id || null;
        }

        // Archive the meeting as a structured text file in private storage so
        // the agent can re-read the full meeting later and the user can download it.
        if (sessionId) {
          try {
            const when = new Date().toLocaleString();
            const fileBody = [
              `Title: ${title}`,
              `Date: ${when}`,
              `Attendees: ${attendees.length ? attendees.join(", ") : "solo / not specified"}`,
              `Location: ${location || "not specified"}`,
              topics.length ? `Topics: ${topics.join(", ")}` : "",
              "",
              "── Summary ──",
              summary || "(no summary)",
              "",
              mergedKeyPoints.length ? "── Key Points ──" : "",
              ...mergedKeyPoints.map((k) => `• ${k}`),
              "",
              "── Action Items ──",
              ...items
                .filter((it) => it.type !== "key_point" && it.title?.trim())
                .map((it) => `• [${TYPE_META[it.type].label}] ${it.title}${it.due_date ? ` (due ${it.due_date})` : ""}${it.event_date ? ` (${it.event_date}${it.event_time ? ` ${it.event_time}` : ""})` : ""}${it.description ? ` — ${it.description}` : ""}`),
              "",
              "── Full Transcript ──",
              transcriptText,
            ]
              .filter((l) => l !== "")
              .join("\n");

            const path = `${user.id}/${sessionId}.txt`;
            const { error: upErr } = await supabase.storage
              .from("steno-transcripts")
              .upload(path, new Blob([fileBody], { type: "text/plain" }), {
                contentType: "text/plain",
                upsert: true,
              });
            if (upErr) {
              console.warn("[Steno] file archive upload failed", upErr);
            } else {
              await supabase
                .from("steno_sessions")
                .update({ transcript_file_path: path, archived_at: new Date().toISOString() } as any)
                .eq("id", sessionId);
            }
          } catch (e) {
            console.warn("[Steno] archive step failed", e);
          }
        }
      }

      const actionItems: any[] = [];
      const reminders: any[] = [];
      const contactReminders: any[] = [];
      const calendarEvents: ExtractedItem[] = [];

      for (const it of items) {
        if (!it.title?.trim()) continue;
        if (it.type === "key_point") {
          // Already saved with the session above — skip the action/reminder pipeline.
          continue;
        }
        if (it.type === "calendar_event") {
          if (!it.event_date) {
            toast.error(`"${it.title}" needs a date — set one before saving.`);
            return;
          }
          calendarEvents.push(it);
        } else if (it.type === "task" || it.type === "followup") {
          actionItems.push({
            user_id: user.id,
            title: it.title.trim(),
            description: it.description || null,
            due_date: it.due_date || null,
            priority: it.priority || (it.type === "followup" ? "low" : "medium"),
            status: "open",
            source: "steno",
            steno_session_id: sessionId,
          });
        } else if (it.type === "reminder") {
          reminders.push({
            user_id: user.id,
            email_subject: it.title.trim(),
            email_from: "steno",
            email_snippet: it.description || null,
            remind_at: it.remind_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            status: "pending",
            steno_session_id: sessionId,
          });
        } else if (it.type === "contact_reminder") {
          contactReminders.push({
            user_id: user.id,
            contact_name: it.contact_name || it.title.trim(),
            reminder_date: it.reminder_date || new Date().toISOString().slice(0, 10),
            reminder_type: it.reminder_type || "check-in",
            recurring: it.recurring ?? false,
            notes: it.description || null,
            steno_session_id: sessionId,
          });
        }
      }

      const ops: Promise<any>[] = [];
      if (actionItems.length) ops.push(Promise.resolve(supabase.from("action_items").insert(actionItems)));
      if (reminders.length) ops.push(Promise.resolve(supabase.from("email_reminders").insert(reminders)));
      if (contactReminders.length) ops.push(Promise.resolve(supabase.from("contact_reminders").insert(contactReminders)));

      const results = await Promise.all(ops);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;

      // Push calendar events to Google Calendar
      let calendarFailed = 0;
      let calendarReconnect = false;
      let calendarSaved = 0;
      for (const ev of calendarEvents) {
        const allDay = ev.all_day !== false && !ev.event_time;
        const start = allDay
          ? ev.event_date!
          : new Date(`${ev.event_date}T${ev.event_time}:00`).toISOString();
        const end = allDay
          ? undefined
          : ev.event_end_time
          ? new Date(`${ev.event_date}T${ev.event_end_time}:00`).toISOString()
          : undefined;

        const { data: cdata, error: cerr } = await supabase.functions.invoke("calendar-event-create", {
          body: {
            summary: ev.title.trim(),
            description: ev.description || undefined,
            location: ev.location || undefined,
            start,
            end,
            allDay,
          },
        });
        if (cerr || cdata?.error) {
          calendarFailed++;
          if (cdata?.code === "RECONNECT_REQUIRED" || cdata?.code === "NOT_CONNECTED") {
            calendarReconnect = true;
          }
          console.error("[Steno] calendar event failed", ev.title, cerr || cdata?.error);
        } else {
          calendarSaved++;
        }
      }

      if (calendarReconnect) {
        toast.error("Google Calendar isn't connected — connect it in Integrations to save events.");
      } else if (calendarFailed > 0) {
        toast.error(`${calendarFailed} calendar event${calendarFailed === 1 ? "" : "s"} failed to save.`);
      }

      const otherSaved = items.length - calendarEvents.length + calendarSaved;
      toast.success(`Saved ${otherSaved} item${otherSaved === 1 ? "" : "s"} ✨`);
      setItems([]);
      setTranscript("");
      setInterim("");
      transcriptRef.current = "";
    } catch (e) {
      console.error("[Steno] save failed", e);
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [items]);

  const handleClear = () => {
    setTranscript("");
    setInterim("");
    transcriptRef.current = "";
    setItems([]);
  };

  const toggleMic = () => {
    if (speech.isListening) speech.stopListening();
    else speech.startListening();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container max-w-3xl flex items-center h-14 px-4">
          <button
            onClick={() => { speech.stopListening(); navigate("/office"); }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => { speech.stopListening(); navigate("/steno/history"); }}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-3"
          >
            History
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="font-display text-base font-semibold">Steno</span>
          </div>
        </div>
      </nav>

      <div className="flex-1 container max-w-3xl py-6 px-4 space-y-6">
        {/* Intro */}
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-semibold">Just talk. {agentName} is listening.</h1>
          <p className="text-sm text-muted-foreground">
            Dictate tasks, reminders, birthdays, follow-ups — anything. Review and save when you're done.
          </p>
        </div>

        {/* Mic + transcript */}
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-center">
            <button
              onClick={speech.isSupported ? toggleMic : undefined}
              disabled={!speech.isSupported}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                !speech.isSupported
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : speech.isListening
                  ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 animate-pulse"
                  : "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
              }`}
              title={speech.isListening ? "Stop dictation" : "Start dictation"}
            >
              {speech.isListening ? <Square className="w-7 h-7 fill-current" /> : <Mic className="w-7 h-7" />}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {!speech.isSupported
              ? "Voice not supported in this browser. Try Chrome, Edge, or Safari."
              : speech.isListening
              ? "Listening… tap to stop"
              : transcript
              ? "Tap to keep dictating, or extract below"
              : "Tap the mic to begin"}
          </p>

          <Textarea
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => {
              transcriptRef.current = e.target.value;
              setTranscript(e.target.value);
              setInterim("");
            }}
            placeholder="Your dictation will appear here. You can also type or edit directly."
            className="min-h-[140px] text-sm leading-relaxed resize-none"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleExtract}
              disabled={extracting || !transcript.trim()}
              className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Extracting…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Capture items
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={!transcript && items.length === 0}
              className="h-11 px-4 rounded-xl border text-sm text-muted-foreground hover:text-foreground hover:bg-accent/5 transition-colors disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Review cards */}
        <AnimatePresence mode="popLayout">
          {items.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  Review ({items.length})
                </h2>
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="h-9 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-medium flex items-center gap-2 hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save all
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it) => {
                  const meta = TYPE_META[it.type];
                  const Icon = meta.icon;
                  return (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="rounded-xl border bg-card p-4 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta.tint}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${meta.tint} border-0`}>
                              {meta.label}
                            </span>
                          </div>
                          <Input
                            value={it.title}
                            onChange={(e) => updateItem(it.id, { title: e.target.value })}
                            className="font-medium text-sm h-9"
                          />
                          {/* Type-specific fields */}
                          {it.type === "calendar_event" && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="date"
                                  value={it.event_date || ""}
                                  onChange={(e) => updateItem(it.id, { event_date: e.target.value })}
                                  className="h-9 text-xs"
                                />
                                <Input
                                  type="time"
                                  value={it.event_time || ""}
                                  onChange={(e) => updateItem(it.id, { event_time: e.target.value, all_day: e.target.value ? false : true })}
                                  placeholder="Time"
                                  className="h-9 text-xs"
                                />
                              </div>
                              <Input
                                value={it.location || ""}
                                onChange={(e) => updateItem(it.id, { location: e.target.value })}
                                placeholder="Location (optional)"
                                className="h-9 text-xs"
                              />
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={it.all_day !== false && !it.event_time}
                                  onChange={(e) => updateItem(it.id, { all_day: e.target.checked, event_time: e.target.checked ? undefined : it.event_time })}
                                  className="rounded"
                                />
                                All day
                              </label>
                            </div>
                          )}
                          {(it.type === "task" || it.type === "followup") && (
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="date"
                                value={it.due_date || ""}
                                onChange={(e) => updateItem(it.id, { due_date: e.target.value })}
                                className="h-9 text-xs"
                                placeholder="Due date"
                              />
                              <select
                                value={it.priority || "medium"}
                                onChange={(e) => updateItem(it.id, { priority: e.target.value as any })}
                                className="h-9 text-xs rounded-md border border-input bg-background px-3"
                              >
                                <option value="low">Low priority</option>
                                <option value="medium">Medium priority</option>
                                <option value="high">High priority</option>
                              </select>
                            </div>
                          )}
                          {it.type === "reminder" && (
                            <Input
                              type="datetime-local"
                              value={it.remind_at ? it.remind_at.slice(0, 16) : ""}
                              onChange={(e) => updateItem(it.id, { remind_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                              className="h-9 text-xs"
                            />
                          )}
                          {it.type === "contact_reminder" && (
                            <div className="space-y-2">
                              <Input
                                value={it.contact_name || ""}
                                onChange={(e) => updateItem(it.id, { contact_name: e.target.value })}
                                placeholder="Contact name"
                                className="h-9 text-xs"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="date"
                                  value={it.reminder_date || ""}
                                  onChange={(e) => updateItem(it.id, { reminder_date: e.target.value })}
                                  className="h-9 text-xs"
                                />
                                <select
                                  value={it.reminder_type || "check-in"}
                                  onChange={(e) => updateItem(it.id, { reminder_type: e.target.value })}
                                  className="h-9 text-xs rounded-md border border-input bg-background px-3"
                                >
                                  <option value="birthday">Birthday</option>
                                  <option value="anniversary">Anniversary</option>
                                  <option value="check-in">Check-in</option>
                                </select>
                              </div>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={!!it.recurring}
                                  onChange={(e) => updateItem(it.id, { recurring: e.target.checked })}
                                  className="rounded"
                                />
                                Recurring yearly
                              </label>
                            </div>
                          )}
                          {it.description && (
                            <p className="text-xs text-muted-foreground italic">{it.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {items.length === 0 && transcript && !extracting && (
          <p className="text-center text-xs text-muted-foreground">
            Tap <strong>Capture items</strong> to let {agentName} structure your dictation.
          </p>
        )}
      </div>
    </div>
  );
}
