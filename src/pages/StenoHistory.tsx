import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Sparkles, Search, ChevronDown, ChevronUp, Trash2, FileText, Calendar, MapPin, Users, Folder, Lightbulb, CheckSquare, Bell, Cake, Download, Mail, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface StenoSession {
  id: string;
  title: string;
  transcript: string;
  summary: string | null;
  topics: string[];
  attendees: string[];
  location: string | null;
  key_points: string[];
  item_count: number;
  session_date: string;
  created_at: string;
  transcript_file_path?: string | null;
}

interface RelatedTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  kind: "task" | "email_reminder" | "contact_reminder";
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","by","from","is","are","was","were","be","been","being","this","that","these","those","it","its","i","we","you","they","he","she","my","our","your","their","as","if","then","than","so","do","does","did","have","has","had","will","would","should","could","can","may","not","no","yes","up","down","out","over","about","into","onto","also","just","very","more","most","some","any","all","one","two","each","other","new","get","got","want","need","like","make","made","let","lets","go","going","know","think","said","says","say","ok","okay"
]);

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function findRelated(kp: string, tasks: RelatedTask[]): RelatedTask[] {
  const kpTokens = tokens(kp);
  if (kpTokens.size === 0) return [];
  const scored = tasks
    .map((t) => {
      const tt = tokens(`${t.title} ${t.description || ""}`);
      let overlap = 0;
      kpTokens.forEach((w) => { if (tt.has(w)) overlap++; });
      return { t, overlap };
    })
    .filter((x) => x.overlap >= 2 || (x.overlap >= 1 && kpTokens.size <= 4))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);
  return scored.map((x) => x.t);
}

interface AgingItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  created_at: string;
  steno_session_id: string | null;
  session_title?: string;
}

export default function StenoHistory() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StenoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [relatedBySession, setRelatedBySession] = useState<Record<string, RelatedTask[]>>({});
  const [selectedRelated, setSelectedRelated] = useState<{ item: RelatedTask; sessionTitle: string; keyPoint: string } | null>(null);
  const [agingOpen, setAgingOpen] = useState(true);
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [draftingFor, setDraftingFor] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: sess, error } = await supabase
        .from("steno_sessions")
        .select("id, title, transcript, summary, topics, attendees, location, key_points, item_count, session_date, created_at, transcript_file_path")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        toast.error("Couldn't load Steno folder");
      } else {
        const sessionList = (sess as any[]) || [];
        setSessions(sessionList);
        const titleById = new Map<string, string>(sessionList.map((s) => [s.id, s.title]));
        const ids = sessionList.map((s: any) => s.id);
        if (ids.length > 0) {
          const [a, e, c, openTasks] = await Promise.all([
            supabase.from("action_items").select("id, title, description, status, due_date, steno_session_id").in("steno_session_id", ids),
            supabase.from("email_reminders").select("id, email_subject, email_snippet, status, remind_at, steno_session_id").in("steno_session_id", ids),
            supabase.from("contact_reminders").select("id, contact_name, notes, reminder_type, reminder_date, steno_session_id").in("steno_session_id", ids),
            supabase.from("action_items").select("id, title, description, due_date, priority, created_at, steno_session_id").eq("source", "steno").in("status", ["open", "in_progress"]).order("created_at", { ascending: true }),
          ]);
          const map: Record<string, RelatedTask[]> = {};
          (a.data || []).forEach((row: any) => {
            if (!row.steno_session_id) return;
            (map[row.steno_session_id] ||= []).push({ id: row.id, title: row.title, description: row.description, status: row.status, due_date: row.due_date, kind: "task" });
          });
          (e.data || []).forEach((row: any) => {
            if (!row.steno_session_id) return;
            (map[row.steno_session_id] ||= []).push({ id: row.id, title: row.email_subject, description: row.email_snippet, status: row.status, due_date: row.remind_at, kind: "email_reminder" });
          });
          (c.data || []).forEach((row: any) => {
            if (!row.steno_session_id) return;
            (map[row.steno_session_id] ||= []).push({ id: row.id, title: `${row.reminder_type === "birthday" ? "🎂 " : ""}${row.contact_name}`, description: row.notes, status: "scheduled", due_date: row.reminder_date, kind: "contact_reminder" });
          });
          setRelatedBySession(map);
          const agingItems: AgingItem[] = ((openTasks.data as any[]) || []).map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            due_date: row.due_date,
            priority: row.priority,
            created_at: row.created_at,
            steno_session_id: row.steno_session_id,
            session_title: row.steno_session_id ? titleById.get(row.steno_session_id) : undefined,
          }));
          setAging(agingItems);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const completeAging = async (id: string) => {
    const { error } = await supabase.from("action_items").update({ status: "done" } as any).eq("id", id);
    if (error) {
      toast.error("Couldn't update");
      return;
    }
    setAging((prev) => prev.filter((x) => x.id !== id));
    toast.success("Marked done");
  };

  const draftFollowup = async (sessionId: string, sessionTitle: string) => {
    setDraftingFor(sessionId);
    try {
      const { data, error } = await supabase.functions.invoke("steno-followup-draft", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const created = data?.created || 0;
      const unresolved = data?.unresolved || [];
      if (created === 0) {
        toast.error(unresolved.length ? `No emails matched: ${unresolved.join(", ")}` : "No drafts created");
      } else {
        toast.success(`${created} follow-up draft${created === 1 ? "" : "s"} ready in Approval Inbox`, {
          description: unresolved.length ? `Skipped (no email): ${unresolved.join(", ")}` : `For "${sessionTitle}"`,
          action: { label: "Review", onClick: () => navigate("/inbox") },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft follow-up");
    } finally {
      setDraftingFor(null);
    }
  };

  const ageBucket = (createdAt: string, dueDate: string | null): { label: string; tone: string; sortKey: number } => {
    const now = Date.now();
    if (dueDate) {
      const due = new Date(dueDate).getTime();
      if (due < now) return { label: "Overdue", tone: "bg-destructive/10 text-destructive border-destructive/30", sortKey: 0 };
    }
    const ageDays = Math.floor((now - new Date(createdAt).getTime()) / 86_400_000);
    if (ageDays >= 14) return { label: `${ageDays}d old`, tone: "bg-orange-500/10 text-orange-700 border-orange-500/30", sortKey: 1 };
    if (ageDays >= 7) return { label: `${ageDays}d old`, tone: "bg-amber-500/10 text-amber-700 border-amber-500/30", sortKey: 2 };
    return { label: `${ageDays}d`, tone: "bg-muted text-muted-foreground border-border", sortKey: 3 };
  };

  const sortedAging = [...aging].sort((a, b) => {
    const ba = ageBucket(a.created_at, a.due_date).sortKey;
    const bb = ageBucket(b.created_at, b.due_date).sortKey;
    if (ba !== bb) return ba - bb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this Steno session? Items already saved (tasks, events, etc.) won't be removed.")) return;
    const { error } = await supabase.from("steno_sessions").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed");
    } else {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Session deleted");
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.summary || "").toLowerCase().includes(q) ||
          s.transcript.toLowerCase().includes(q) ||
          s.topics.some((t) => t.toLowerCase().includes(q)) ||
          (s.attendees || []).some((a) => a.toLowerCase().includes(q)) ||
          (s.location || "").toLowerCase().includes(q)
      )
    : sessions;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container max-w-5xl flex items-center h-14 px-4">
          <button
            onClick={() => navigate("/steno")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Steno</span>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Folder className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="font-display text-base font-semibold">Steno Folder</span>
          </div>
        </div>
      </nav>

      <div className="flex-1 container max-w-5xl py-6 px-4 space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Your meeting folder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every Steno recording — title, date, who you were with, and where. Normy can search the full transcripts when you ask.
          </p>
        </div>


        {/* Open action items aging */}
        {sortedAging.length > 0 && (
          <div className="rounded-2xl border bg-card overflow-hidden">
            <button
              onClick={() => setAgingOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-orange-600" />
                </div>
                <div className="text-left">
                  <h2 className="font-semibold text-foreground text-sm">Open action items from your meetings</h2>
                  <p className="text-xs text-muted-foreground">
                    {sortedAging.length} pending · sorted by urgency
                  </p>
                </div>
              </div>
              {agingOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {agingOpen && (
              <ul className="divide-y border-t">
                {sortedAging.slice(0, 20).map((item) => {
                  const bucket = ageBucket(item.created_at, item.due_date);
                  const isOverdue = bucket.label === "Overdue";
                  return (
                    <li key={item.id} className="px-5 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                      <button
                        onClick={() => completeAging(item.id)}
                        className="mt-0.5 w-5 h-5 rounded-md border-2 border-muted-foreground/40 hover:border-accent hover:bg-accent/10 flex items-center justify-center shrink-0 transition-colors"
                        title="Mark done"
                      >
                        <CheckSquare className="w-3 h-3 text-accent opacity-0 hover:opacity-100" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${bucket.tone}`}>
                            {isOverdue && <AlertTriangle className="w-2.5 h-2.5" />}
                            {bucket.label}
                          </span>
                          {item.due_date && (
                            <span>due {format(parseISO(item.due_date), "MMM d")}</span>
                          )}
                          {item.session_title && (
                            <span className="truncate max-w-[200px]">from "{item.session_title}"</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, person, location, topic, or anything said…"
            className="pl-9"
          />
        </div>


        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {q ? "No sessions match that search." : "No saved sessions yet — open Steno Pad and start dictating."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((s) => {
              const open = expanded.has(s.id);
              const attendeeStr = (s.attendees || []).filter(Boolean);
              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border bg-card overflow-hidden transition-all ${open ? "md:col-span-2 ring-1 ring-accent/30" : "hover:border-accent/40 hover:shadow-sm"}`}
                >
                  <button
                    onClick={() => toggle(s.id)}
                    className="w-full text-left px-5 py-4 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                          <Folder className="w-4 h-4 text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground truncate">{s.title}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>{format(parseISO(s.created_at), "MMM d, yyyy · h:mm a")}</span>
                          </div>
                        </div>
                      </div>
                      {open ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </div>

                    {/* Meta row */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      {attendeeStr.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3 shrink-0" />
                          <span className="truncate">{attendeeStr.join(", ")}</span>
                        </div>
                      )}
                      {s.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{s.location}</span>
                        </div>
                      )}
                      {s.item_count > 0 && (
                        <span>{s.item_count} item{s.item_count === 1 ? "" : "s"}</span>
                      )}
                    </div>

                    {s.summary && !open && (
                      <p className="text-sm text-muted-foreground mt-2.5 line-clamp-2">{s.summary}</p>
                    )}

                    {s.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {s.topics.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                  {open && (
                    <div className="px-5 pb-5 space-y-3 border-t bg-muted/20">
                      {s.summary && (
                        <div className="pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            Summary
                          </p>
                          <p className="text-sm text-foreground leading-relaxed">{s.summary}</p>
                        </div>
                      )}
                      {s.key_points && s.key_points.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Lightbulb className="w-3 h-3 text-amber-600" /> Key points
                          </p>
                          <ul className="space-y-2.5">
                            {s.key_points.map((kp, i) => {
                              const sessionItems = relatedBySession[s.id] || [];
                              const related = findRelated(kp, sessionItems);
                              return (
                                <li key={i} className="text-sm text-foreground/90">
                                  <div className="flex gap-2">
                                    <span className="text-amber-600 shrink-0">•</span>
                                    <span className="flex-1">{kp}</span>
                                  </div>
                                  {related.length > 0 && (
                                    <div className="ml-4 mt-1.5 flex flex-wrap gap-1.5">
                                      {related.map((r) => {
                                        const Icon = r.kind === "task" ? CheckSquare : r.kind === "email_reminder" ? Bell : Cake;
                                        const tone =
                                          r.kind === "task"
                                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/15"
                                            : r.kind === "email_reminder"
                                            ? "bg-blue-500/10 text-blue-700 border-blue-500/20 hover:bg-blue-500/15"
                                            : "bg-pink-500/10 text-pink-700 border-pink-500/20 hover:bg-pink-500/15";
                                        const onClick = () => {
                                          setSelectedRelated({ item: r, sessionTitle: s.title, keyPoint: kp });
                                        };
                                        return (
                                          <button
                                            key={r.id}
                                            onClick={onClick}
                                            title="Click to view full details"
                                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors max-w-[240px] ${tone} ${r.status === "completed" || r.status === "done" ? "line-through opacity-70" : ""}`}
                                          >
                                            <Icon className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{r.title}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          {(relatedBySession[s.id] || []).length === 0 && (
                            <p className="text-[11px] text-muted-foreground/70 mt-2 ml-4 italic">
                              No tasks or reminders linked to this session yet.
                            </p>
                          )}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Full transcript
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                          {s.transcript}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {(s.attendees || []).filter(Boolean).length > 0 && (
                          <button
                            onClick={() => draftFollowup(s.id, s.title)}
                            disabled={draftingFor === s.id}
                            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors px-2 py-1 rounded-lg hover:bg-accent/10 disabled:opacity-50"
                            title="AI-draft a follow-up email per attendee"
                          >
                            {draftingFor === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                            {draftingFor === s.id ? "Drafting…" : "Draft follow-up email"}
                          </button>
                        )}
                        {s.transcript_file_path && (
                          <button
                            onClick={async () => {
                              try {
                                const { data, error } = await supabase.storage
                                  .from("steno-transcripts")
                                  .createSignedUrl(s.transcript_file_path!, 60);
                                if (error || !data?.signedUrl) throw error || new Error("No URL");
                                window.open(data.signedUrl, "_blank");
                              } catch (e) {
                                toast.error("Could not open archived file");
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-accent/5"
                          >
                            <Download className="w-3 h-3" /> Download .txt
                          </button>
                        )}
                        <button
                          onClick={() => remove(s.id)}
                          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors px-2 py-1 rounded-lg hover:bg-destructive/5"
                        >
                          <Trash2 className="w-3 h-3" /> Delete session
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selectedRelated} onOpenChange={(o) => !o && setSelectedRelated(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedRelated && (() => {
            const r = selectedRelated.item;
            const Icon = r.kind === "task" ? CheckSquare : r.kind === "email_reminder" ? Bell : Cake;
            const label =
              r.kind === "task" ? "Task" : r.kind === "email_reminder" ? "Email reminder" : "Contact reminder";
            const tone =
              r.kind === "task"
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                : r.kind === "email_reminder"
                ? "bg-blue-500/10 text-blue-700 border-blue-500/20"
                : "bg-pink-500/10 text-pink-700 border-pink-500/20";
            const dueLabel = r.due_date
              ? r.kind === "task"
                ? format(parseISO(r.due_date), "EEE, MMM d, yyyy")
                : format(parseISO(r.due_date), "EEE, MMM d, yyyy · h:mm a")
              : null;
            const openInPage = () => {
              if (r.kind === "task") navigate("/tasks");
              else if (r.kind === "email_reminder") navigate("/inbox");
              else navigate("/contacts");
            };
            return (
              <>
                <SheetHeader className="space-y-3">
                  <div className={`inline-flex items-center gap-1.5 self-start text-[11px] px-2 py-0.5 rounded-full border ${tone}`}>
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                  </div>
                  <SheetTitle className="font-display text-xl leading-tight">{r.title}</SheetTitle>
                  <SheetDescription>
                    Linked to <span className="font-medium text-foreground">{selectedRelated.sessionTitle}</span>
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Lightbulb className="w-3 h-3 text-amber-600" /> From key point
                    </p>
                    <p className="text-sm text-foreground/90">{selectedRelated.keyPoint}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-1">Status</p>
                      <p className="text-sm capitalize text-foreground">{r.status.replace(/_/g, " ")}</p>
                    </div>
                    {dueLabel && (
                      <div>
                        <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          {r.kind === "task" ? "Due" : r.kind === "email_reminder" ? "Remind at" : "Date"}
                        </p>
                        <p className="text-sm text-foreground">{dueLabel}</p>
                      </div>
                    )}
                  </div>

                  {r.description && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        Details
                      </p>
                      <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
                        {r.description}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex gap-2">
                    <Button onClick={openInPage} className="flex-1">
                      Open in {r.kind === "task" ? "Tasks" : r.kind === "email_reminder" ? "Inbox" : "Contacts"}
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedRelated(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
