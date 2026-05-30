// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from "react";
import { useMotionValue, useTransform, animate as fmAnimate } from "framer-motion";
import { motion, AnimatePresence } from "framer-motion";
import { format, addHours, addDays, nextMonday, nextSaturday, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { ReconnectBanner } from "@/components/ReconnectBanner";
import {
  AlertTriangle,
  MessageSquareReply,
  Eye,
  Newspaper,
  RefreshCw,
  Mail,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  PenLine,
  X,
  Inbox,
  CheckCheck,
  Send,
  FileText,
  Zap,
  CalendarClock,
  ListChecks,
  Archive,
  Search,
  Moon,
  BellOff,
  SquareCheck,
  Square,
  MoveRight,
  CheckCheck as CheckCheckIcon,
  SquarePen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useTriagedEmails, type TriagedEmail } from "@/hooks/useTriagedEmails";
import { SenderContactCard } from "@/components/SenderContactCard";
import { ComposeModal } from "@/components/ComposeModal";

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|td|th|li|blockquote|h[1-6]|table|tbody|thead)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "")
    .split("\n").map(l => l.trim()).join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

const TABS = [
  { id: "urgent",      label: "Urgent",       icon: AlertTriangle,      color: "text-destructive",      bg: "bg-destructive/10", ring: "ring-destructive/30" },
  { id: "needs_reply", label: "Needs Reply",   icon: MessageSquareReply, color: "text-accent",           bg: "bg-accent/10",      ring: "ring-accent/30"      },
  { id: "fyi",         label: "FYI Only",      icon: Eye,                color: "text-muted-foreground", bg: "bg-muted",          ring: ""                    },
  { id: "newsletter",  label: "Newsletter",    icon: Newspaper,          color: "text-muted-foreground", bg: "bg-muted",          ring: ""                    },
] as const;

// ─── Constants (outside components — not redefined per render) ────────────────

const CATEGORY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  needs_reply: "Needs Reply",
  fyi: "FYI",
  newsletter: "Newsletter",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const EmailSkeleton = () => (
  <div className="glass-card rounded-xl p-4 animate-pulse">
    <div className="flex items-start gap-3">
      <div className="w-1 h-10 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-12 ml-auto" />
        </div>
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="h-2.5 bg-muted rounded w-full" />
      </div>
    </div>
  </div>
);

// ─── Time grouping ────────────────────────────────────────────────────────────

function getTimeGroup(iso: string): string {
  try {
    const now = new Date();
    const d = new Date(iso);
    const todayStr = now.toISOString().slice(0, 10);
    const dStr = d.toISOString().slice(0, 10);
    if (dStr === todayStr) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dStr === yesterday.toISOString().slice(0, 10)) return "Yesterday";
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    if (d >= weekAgo) return "This week";
    return "Earlier";
  } catch {
    return "Earlier";
  }
}

const TIME_GROUP_ORDER = ["Today", "Yesterday", "This week", "Earlier"];

// ─── Priority bar color ───────────────────────────────────────────────────────

function priorityBarColor(category: string, score: number | null): string {
  if (category === "urgent") return (score ?? 0) >= 8 ? "bg-destructive" : "bg-destructive/50";
  if (category === "needs_reply") return "bg-accent";
  if (category === "fyi") return "bg-muted-foreground/40";
  return "bg-muted-foreground/20";
}

// ─── Snooze helpers ──────────────────────────────────────────────────────────

function midnight(d: Date): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 0), 0), 0), 0);
}
function at9am(d: Date): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 9), 0), 0), 0);
}
function at5pm(d: Date): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 17), 0), 0), 0);
}

function computeSnoozeOptions() {
  const now = new Date();
  const opts: { label: string; sub: string; date: Date }[] = [];

  opts.push({ label: "In 1 hour", sub: format(addHours(now, 1), "h:mm a"), date: addHours(now, 1) });

  if (now.getHours() < 15) {
    opts.push({ label: "Later today", sub: format(at5pm(now), "h:mm a"), date: at5pm(now) });
  }

  const tomorrow = addDays(midnight(now), 1);
  opts.push({ label: "Tomorrow morning", sub: format(at9am(tomorrow), "EEE, h:mm a"), date: at9am(tomorrow) });

  const day = now.getDay();
  if (day !== 6 && day !== 0) {
    const sat = nextSaturday(now);
    opts.push({ label: "This weekend", sub: format(at9am(sat), "EEE, MMM d"), date: at9am(sat) });
  }

  const mon = day === 1 ? addDays(now, 7) : nextMonday(now);
  opts.push({ label: "Next week", sub: format(at9am(mon), "EEE, MMM d"), date: at9am(mon) });

  return opts;
}

function snoozeLabel(until: string): string {
  try {
    const d = new Date(until);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const hrs = Math.floor(diff / 3_600_000);
    if (hrs < 24) return `Wakes up ${format(d, "h:mm a")}`;
    return `Wakes up ${format(d, "EEE, MMM d h:mm a")}`;
  } catch { return "Snoozed"; }
}

// ─── Snooze bottom sheet ──────────────────────────────────────────────────────

const SnoozeSheet = ({ email, onClose, onSnooze }: {
  email: TriagedEmail;
  onClose: () => void;
  onSnooze: (email: TriagedEmail, until: Date) => void;
}) => {
  const opts = computeSnoozeOptions();
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-foreground/40 flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="bg-background w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-accent" />
              <h3 className="font-display text-sm font-semibold">Snooze until…</h3>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3 truncate">
            {email.subject || email.from_name || "Email"}
          </p>
          <div className="space-y-1">
            {opts.map(opt => (
              <button
                key={opt.label}
                onClick={() => { onSnooze(email, opt.date); onClose(); }}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{opt.sub}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Snoozed section ──────────────────────────────────────────────────────────

const SnoozedSection = ({ emails, onUnsnooze }: {
  emails: TriagedEmail[];
  onUnsnooze: (email: TriagedEmail) => void;
}) => {
  const [open, setOpen] = useState(false);
  if (emails.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <Moon className="w-4 h-4 text-accent/70" />
        <span className="font-medium">{emails.length} Snoozed</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {emails.map(email => (
            <div key={email.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/30">
              <Moon className="w-3.5 h-3.5 text-accent/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{email.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground">{email.from_name || email.from_address} · {email.snoozed_until ? snoozeLabel(email.snoozed_until) : ""}</p>
              </div>
              <button
                onClick={() => onUnsnooze(email)}
                className="shrink-0 text-xs text-accent hover:text-accent/80 font-medium px-2 py-1 rounded-lg hover:bg-accent/10 transition-colors"
              >
                Wake
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Email Card ───────────────────────────────────────────────────────────────

const EmailCard = ({ email, dimmed = false, onCategoryChange, onArchive, onMarkRead, onSnooze, onLongPress, selectMode, isSelected, onSelect }: {
  email: TriagedEmail;
  dimmed?: boolean;
  onCategoryChange?: (id: string, cat: string) => void;
  onArchive?: (email: TriagedEmail) => void;
  onMarkRead?: (id: string, nylasMessageId: string) => void;
  onSnooze?: (email: TriagedEmail) => void;
  onLongPress?: () => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [-110, -40, 0], [1, 0.3, 0]);
  const snoozeOpacity = useTransform(x, [0, 40, 110], [0, 0.3, 1]);
  const archiveScale = useTransform(x, [-110, -60], [1, 0.85]);
  const snoozeScale = useTransform(x, [60, 110], [0.85, 1]);

  const handlePointerDown = () => {
    if (!selectMode) {
      longPressTimer.current = setTimeout(() => { onLongPress?.(); onSelect?.(email.id); }, 500);
    }
  };
  const handlePointerUp = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };
  const cancelLongPress = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (!expanded && info.offset.x < -80 && onArchive) {
      fmAnimate(x, -500, { duration: 0.22, ease: "easeOut" });
      setTimeout(() => onArchive(email), 220);
    } else if (!expanded && info.offset.x > 80 && onSnooze) {
      fmAnimate(x, 0, { type: "spring", damping: 22, stiffness: 300 });
      onSnooze(email);
    } else {
      fmAnimate(x, 0, { type: "spring", damping: 22, stiffness: 300 });
    }
  };

  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  // Sent reply fetch (on-demand when expanding a replied email)
  const [sentReply, setSentReply] = useState<{ body: string; sent_at: string } | null>(null);
  const [loadingReply, setLoadingReply] = useState(false);

  const [movingTo, setMovingTo] = useState<string | null>(null);

  const moveToCategory = (newCategory: string) => {
    setMovingTo(newCategory);
    onCategoryChange?.(email.id, newCategory);
    // Card will unmount as parent re-renders — no cleanup needed
  };

  const canDraft = (email.category === "urgent" || email.category === "needs_reply") && !email.replied_at;
  const canSummarize = (email.category === "urgent" || email.category === "needs_reply") && !email.replied_at;
  const [summary, setSummary] = useState<{ tldr: string; action_needed: string; deadline: string; key_points: string[]; tone: string } | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-summarize", {
        body: {
          subject: email.subject ?? "",
          from_name: email.from_name,
          from_address: email.from_address,
          body: body || email.ai_summary || "",
          ai_summary: email.ai_summary,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
    } catch (err: any) {
      toast({ title: "Summary failed", description: err?.message || "Could not summarize", variant: "destructive" });
    } finally {
      setSummarizing(false);
    }
  };

  const [draftOpen, setDraftOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayName = email.from_name || email.from_address;

  const timeAgo = (() => {
    try {
      const diff = Date.now() - new Date(email.received_at).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return "";
    }
  })();

  const repliedTimeAgo = (() => {
    if (!email.replied_at) return "";
    try {
      const diff = Date.now() - new Date(email.replied_at).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return "";
    }
  })();

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) return;
    // Mark as read when user opens the email
    if (email.is_unread) onMarkRead?.(email.id, email.nylas_message_id);

    // Fetch original body
    if (body === null && !loadingBody) {
      setLoadingBody(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?messageId=${email.nylas_message_id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const msgData = await resp.json();
        if (!msgData.error) {
          const raw = msgData.isHtml
            ? htmlToText(msgData.body)
            : msgData.body;
          setBody(raw);
        }
      } catch {
        // fall through — will show ai_summary instead
      } finally {
        setLoadingBody(false);
      }
    }

    // Fetch sent reply if this email has been replied to
    if (email.replied_at && sentReply === null && !loadingReply) {
      setLoadingReply(true);
      try {
        const { data } = await supabase
          .from("draft_actions")
          .select("body, updated_at")
          .eq("nylas_message_id", email.nylas_message_id)
          .eq("status", "sent")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.body) {
          setSentReply({ body: data.body, sent_at: data.updated_at });
        }
      } catch {
        // silent — reply preview is nice-to-have
      } finally {
        setLoadingReply(false);
      }
    }
  };

  const handleCopy = () => {
    if (!generatedDraft) return;
    navigator.clipboard.writeText(generatedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openDraftPanel = () => {
    setDraftOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const closeDraftPanel = () => {
    if (generating) return;
    setDraftOpen(false);
    setInstructions("");
    setGeneratedDraft(null);
    setDraftSaved(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: {
          nylas_message_id: email.nylas_message_id,
          thread_id: email.nylas_thread_id,
          from_address: email.from_name
            ? `${email.from_name} <${email.from_address}>`
            : email.from_address,
          from_name: email.from_name,
          subject: email.subject ?? "",
          body: body || email.ai_summary || "",
          user_instructions: instructions.trim() || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedDraft(data.draft.body);
      setDraftSaved(true);
    } catch (err: any) {
      toast({
        title: "Draft failed",
        description: err?.message || "Could not generate draft",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={`relative swipeable ${dimmed ? "opacity-55" : ""}`}>
      {/* Swipe reveal: Archive (left) */}
      <motion.div
        style={{ opacity: archiveOpacity }}
        className="absolute inset-0 rounded-xl bg-destructive flex items-center justify-end px-5 gap-2 pointer-events-none"
      >
        <motion.span style={{ scale: archiveScale }} className="text-white text-sm font-semibold">Archive</motion.span>
        <motion.div style={{ scale: archiveScale }}>
          <Archive className="w-5 h-5 text-white" />
        </motion.div>
      </motion.div>

      {/* Swipe reveal: Snooze (right) */}
      <motion.div
        style={{ opacity: snoozeOpacity }}
        className="absolute inset-0 rounded-xl bg-accent flex items-center px-5 gap-2 pointer-events-none"
      >
        <motion.div style={{ scale: snoozeScale }}>
          <Moon className="w-5 h-5 text-accent-foreground" />
        </motion.div>
        <motion.span style={{ scale: snoozeScale }} className="text-accent-foreground text-sm font-semibold">Snooze</motion.span>
      </motion.div>

      {/* Card — draggable horizontally */}
      <motion.div
        style={{ x }}
        drag={selectMode || expanded ? false : "x"}
        dragElastic={{ left: 0.15, right: 0.15 }}
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={cancelLongPress}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative glass-card rounded-xl overflow-hidden transition-shadow ${
          isSelected ? "ring-2 ring-accent" : email.is_unread && !email.replied_at ? "ring-1 ring-accent/20" : ""
        }`}
      >
      {/* Checkbox overlay in select mode */}
      {selectMode && (
        <button
          onClick={() => onSelect?.(email.id)}
          className="absolute top-3 left-3 z-10 w-5 h-5 rounded flex items-center justify-center"
        >
          {isSelected
            ? <SquareCheck className="w-5 h-5 text-accent" />
            : <Square className="w-5 h-5 text-muted-foreground/50" />}
        </button>
      )}
      <button
        onClick={selectMode ? () => onSelect?.(email.id) : handleExpand}
        className={`w-full text-left p-4 hover:bg-muted/30 transition-colors ${selectMode ? "pl-10" : ""}`}
      >
        <div className="flex items-start gap-3">
          {/* Priority bar */}
          <div className={`w-1 rounded-full shrink-0 mt-0.5 ${priorityBarColor(email.category, email.priority_score)}`} style={{ height: "2.5rem" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {email.is_unread && !email.replied_at && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </span>
            </div>
            <p className="text-sm text-foreground truncate">{email.subject || "(no subject)"}</p>
            {email.replied_at ? (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <Send className="w-3 h-3" />
                Replied {repliedTimeAgo}
              </p>
            ) : email.ai_summary ? (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{email.ai_summary}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(email.priority_score ?? 0) >= 8 && !email.replied_at && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                P{email.priority_score}
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          {/* Original Email */}
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Original Email
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase w-10 shrink-0">From</span>
                <span className="text-xs text-foreground">{displayName}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase w-10 shrink-0">Subj</span>
                <span className="text-xs font-medium text-foreground">{email.subject || "(no subject)"}</span>
              </div>
              <div className="border-t border-border/20 pt-2 mt-2">
                {loadingBody ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {body || email.ai_summary || ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sender contact card — compact inline */}
          <SenderContactCard
            fromAddress={email.from_address}
            fromName={email.from_name}
            compact
          />

          {/* Sent Reply */}
          {email.replied_at && (
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Send className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                  Your Reply
                </span>
                {repliedTimeAgo && (
                  <span className="text-[10px] text-muted-foreground ml-auto">{repliedTimeAgo}</span>
                )}
              </div>
              {loadingReply ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading reply…
                </div>
              ) : sentReply ? (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {sentReply.body}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Reply sent — preview not available</p>
              )}
            </div>
          )}

          {/* AI Reason */}
          {email.ai_reason && !email.replied_at && (
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{email.ai_reason}</p>
            </div>
          )}

          {/* Move to category */}
          {!email.replied_at && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">Move to</span>
              {(["urgent", "needs_reply", "fyi", "newsletter"] as const)
                .filter(c => c !== email.category)
                .map(c => {
                  const labels = CATEGORY_LABELS;
                  return (
                    <button
                      key={c}
                      onClick={() => moveToCategory(c)}
                      disabled={movingTo !== null}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
                    >
                      {movingTo === c ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : labels[c]}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Archive + Snooze */}
          {!email.replied_at && (
            <div className="flex items-center gap-2">
              {onSnooze && (
                <button
                  onClick={() => onSnooze(email)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/40 text-muted-foreground hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-colors"
                >
                  <Moon className="w-3.5 h-3.5" />
                  Snooze
                </button>
              )}
              {onArchive && (
                <button
                  onClick={() => onArchive(email)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </button>
              )}
            </div>
          )}

          {/* Summarize */}
          {canSummarize && !summary && (
            <button
              onClick={handleSummarize}
              disabled={summarizing || loadingBody}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
            >
              {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {summarizing ? "Summarizing…" : "Summarize"}
            </button>
          )}

          {summary && (
            <div className="rounded-lg bg-muted/40 border border-border/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> AI Summary
                </span>
                <button onClick={() => setSummary(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* TL;DR */}
              <p className="text-sm text-foreground leading-relaxed">{summary.tldr}</p>

              {/* Action needed */}
              {summary.action_needed && (
                <div className="flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground font-medium">{summary.action_needed}</p>
                </div>
              )}

              {/* Deadline */}
              {summary.deadline && (
                <div className="flex items-start gap-2">
                  <CalendarClock className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground">{summary.deadline}</p>
                </div>
              )}

              {/* Key points */}
              {summary.key_points?.length > 0 && (
                <div className="flex items-start gap-2">
                  <ListChecks className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <ul className="space-y-0.5">
                    {summary.key_points.map((pt, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {pt}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Draft on demand */}
          {canDraft && (
            <div>
              {!draftOpen && !generatedDraft && (
                <button
                  onClick={openDraftPanel}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Draft Reply
                </button>
              )}

              {draftOpen && !generatedDraft && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Draft Reply
                    </span>
                    <button
                      onClick={closeDraftPanel}
                      disabled={generating}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="What should the reply focus on? (optional)"
                    rows={2}
                    disabled={generating}
                    className="w-full text-sm bg-background/60 border border-border/40 rounded-lg px-3 py-2 resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {generating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {generating ? "Generating…" : "Generate Draft"}
                  </button>
                </div>
              )}

              {generatedDraft && (
                <div className="rounded-lg bg-accent/5 border border-accent/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      Draft Reply
                    </span>
                    <div className="flex items-center gap-2">
                      {draftSaved && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Inbox className="w-3 h-3" />
                          Saved to Approval Inbox
                        </span>
                      )}
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{generatedDraft}</p>
                  <button
                    onClick={() => {
                      setGeneratedDraft(null);
                      setDraftSaved(false);
                      setInstructions("");
                      setDraftOpen(true);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-accent transition-colors"
                  >
                    Regenerate with different instructions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </motion.div>
    </div>
  );
};

// ─── Replied Section ──────────────────────────────────────────────────────────

const RepliedSection = ({ emails, onCategoryChange, onArchive, onMarkRead, onSnooze }: {
  emails: TriagedEmail[];
  onCategoryChange: (id: string, cat: string) => void;
  onArchive: (email: TriagedEmail) => void;
  onMarkRead: (id: string, nylasMessageId: string) => void;
  onSnooze: (email: TriagedEmail) => void;
}) => {
  const [open, setOpen] = useState(false);

  if (emails.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <CheckCheck className="w-4 h-4 text-green-500" />
        <span className="font-medium">{emails.length} Replied</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} dimmed onCategoryChange={onCategoryChange} onArchive={onArchive} onMarkRead={onMarkRead} onSnooze={onSnooze} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Time-grouped email list ──────────────────────────────────────────────────

const GroupedEmailList = ({ emails, onCategoryChange, onArchive, onMarkRead, onSnooze, onLongPress, selectMode, selectedIds, onSelect }: {
  emails: TriagedEmail[];
  onCategoryChange: (id: string, cat: string) => void;
  onArchive: (email: TriagedEmail) => void;
  onMarkRead: (id: string, nylasMessageId: string) => void;
  onSnooze: (email: TriagedEmail) => void;
  onLongPress: () => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
}) => {
  const groups: Record<string, TriagedEmail[]> = {};
  for (const e of emails) {
    const g = getTimeGroup(e.received_at);
    if (!groups[g]) groups[g] = [];
    groups[g].push(e);
  }
  const orderedGroups = TIME_GROUP_ORDER.filter(g => groups[g]?.length);

  return (
    <div className="space-y-4">
      {orderedGroups.map(group => (
        <div key={group}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 mb-2">{group}</p>
          <div className="space-y-2">
            {groups[group].map(email => (
              <EmailCard key={email.id} email={email} onCategoryChange={onCategoryChange} onArchive={onArchive} onMarkRead={onMarkRead} onSnooze={onSnooze} onLongPress={onLongPress} selectMode={selectMode} isSelected={selectedIds.has(email.id)} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const EmailTriage = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("urgent");
  const [triaging, setTriaging] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState("");

  const gmailConnected = isConnected("gmail");
  const {
    emails: allEmails,
    snoozedEmails,
    byCategory,
    loading,
    refetch,
    updateEmailCategory,
    markEmailRead,
    removeEmailOptimistic,
    restoreEmailOptimistic,
    confirmArchive,
    snoozeEmail,
    unsnoozeEmail,
  } = useTriagedEmails();

  // Snooze sheet state
  const [snoozeTarget, setSnoozeTarget] = useState<TriagedEmail | null>(null);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoving, setBulkMoving] = useState(false);

  const enterSelectMode = useCallback(() => setSelectMode(true), []);
  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allInTab = byCategory[activeTab as keyof typeof byCategory] || [];
    setSelectedIds(new Set(allInTab.filter(e => !e.replied_at).map(e => e.id)));
  }, [byCategory, activeTab]);

  const bulkArchive = useCallback(() => {
    const toArchive = allEmails.filter(e => selectedIds.has(e.id));
    toArchive.forEach(e => removeEmailOptimistic(e.id));
    exitSelectMode();
    toast({ title: `${toArchive.length} emails archived`, duration: 4000 });
    setTimeout(() => {
      toArchive.forEach(e => confirmArchive(e.id, e.nylas_message_id));
    }, 100);
  }, [allEmails, selectedIds, removeEmailOptimistic, confirmArchive, exitSelectMode, toast]);

  const bulkMarkRead = useCallback(async () => {
    const toMark = allEmails.filter(e => selectedIds.has(e.id) && e.is_unread);
    toMark.forEach(e => markEmailRead(e.id, e.nylas_message_id));
    exitSelectMode();
    toast({ title: `${toMark.length} email${toMark.length === 1 ? "" : "s"} marked as read`, duration: 3000 });
  }, [allEmails, selectedIds, markEmailRead, exitSelectMode, toast]);

  const bulkMove = useCallback(async (category: string) => {
    const toMove = allEmails.filter(e => selectedIds.has(e.id));
    setBulkMoving(true);
    await Promise.all(toMove.map(e => updateEmailCategory(e.id, category as any)));
    setBulkMoving(false);
    exitSelectMode();
    toast({ title: `${toMove.length} emails moved to ${category.replace("_", " ")}`, duration: 3000 });
  }, [allEmails, selectedIds, updateEmailCategory, exitSelectMode, toast]);

  const [searchQuery, setSearchQuery] = useState("");
  const archiveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleArchive = useCallback((email: TriagedEmail) => {
    removeEmailOptimistic(email.id);
    toast({
      title: "Email archived",
      description: email.subject || email.from_name || "Removed from inbox",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            clearTimeout(archiveTimers.current[email.id]);
            delete archiveTimers.current[email.id];
            restoreEmailOptimistic(email);
          }}
        >
          Undo
        </ToastAction>
      ),
      duration: 5000,
    });
    archiveTimers.current[email.id] = setTimeout(() => {
      confirmArchive(email.id, email.nylas_message_id);
      delete archiveTimers.current[email.id];
    }, 5000);
  }, [removeEmailOptimistic, restoreEmailOptimistic, confirmArchive, toast]);

  const searchResults = searchQuery.trim().length > 1
    ? allEmails.filter(e => {
        const q = searchQuery.toLowerCase();
        return (
          e.subject?.toLowerCase().includes(q) ||
          e.from_name?.toLowerCase().includes(q) ||
          e.from_address?.toLowerCase().includes(q) ||
          e.ai_summary?.toLowerCase().includes(q)
        );
      })
    : [];

  const stats = {
    urgent: byCategory.urgent.filter(e => !e.replied_at).length,
    needs_reply: byCategory.needs_reply.filter(e => !e.replied_at).length,
    fyi: byCategory.fyi.filter(e => !e.replied_at).length,
    newsletter: byCategory.newsletter.filter(e => !e.replied_at).length,
  };
  const totalProcessed = byCategory.urgent.length + byCategory.needs_reply.length + byCategory.fyi.length + byCategory.newsletter.length;

  const runTriage = useCallback(async () => {
    setTriaging(true);
    setNeedsReconnect(false);
    try {
      const { data, error } = await supabase.functions.invoke("email-triage", { body: { force: true } });
      if (error) throw error;
      if (data?.error) {
        if (data?.code === "RECONNECT_REQUIRED") {
          setNeedsReconnect(true);
          setReconnectMessage(data.error);
          return;
        }
        throw new Error(data.error);
      }
      await refetch();
      if (data?.actionItemsCreated > 0) {
        toast({
          title: `${data.actionItemsCreated} action item${data.actionItemsCreated > 1 ? "s" : ""} created`,
          description: `${agentName} extracted tasks from your emails`,
        });
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("expired") || msg.includes("reconnect") || msg.includes("Re-authentication")) {
        setNeedsReconnect(true);
        setReconnectMessage(msg);
        return;
      }
      toast({
        title: "Triage failed",
        description: msg || "Could not categorize emails",
        variant: "destructive",
      });
    } finally {
      setTriaging(false);
    }
  }, [agentName, refetch, toast]);

  if (!gmailConnected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-2xl p-8 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Mail className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="font-display text-2xl text-foreground mb-2">Smart Email Triage</h2>
          <p className="text-muted-foreground">
            Connect Gmail to let {agentName} auto-categorize your inbox and draft responses.
          </p>
        </div>
      </div>
    );
  }

  const allInTab = byCategory[activeTab as keyof typeof byCategory] || [];
  const pendingEmails = allInTab.filter(e => !e.replied_at);
  const repliedEmails = allInTab.filter(e => !!e.replied_at);
  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  // Pull-to-refresh
  const pullStartY = useRef<number | null>(null);
  const [pullY, setPullY] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const PULL_THRESHOLD = 64;

  const handlePullStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
  };
  const handlePullMove = (e: React.TouchEvent) => {
    if (pullStartY.current === null || window.scrollY > 0) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) setPullY(Math.min(delta * 0.5, PULL_THRESHOLD + 10));
  };
  const handlePullEnd = async () => {
    if (pullY >= PULL_THRESHOLD) {
      setPullRefreshing(true);
      await refetch();
      setPullRefreshing(false);
    }
    setPullY(0);
    pullStartY.current = null;
  };

  return (
    <div
      className="max-w-3xl mx-auto"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullY > 0 && (
        <div
          className="flex items-center justify-center transition-all"
          style={{ height: pullY, marginBottom: pullY > 8 ? 8 : 0 }}
        >
          <div className={`flex items-center gap-2 text-xs text-muted-foreground ${pullRefreshing ? "" : ""}`}>
            <Loader2 className={`w-4 h-4 ${pullY >= PULL_THRESHOLD || pullRefreshing ? "animate-spin text-accent" : ""}`} />
            {pullY >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </div>
        </div>
      )}
      {needsReconnect && (
        <div className="mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <ReconnectBanner service="gmail" message={reconnectMessage} />
        </div>
      )}

      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <Mail className="w-8 h-8 text-accent" />
            Email Triage
          </h1>
          {totalProcessed > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {totalProcessed} emails · live via webhook · last synced by {agentName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            title="Compose new email"
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={selectMode ? exitSelectMode : enterSelectMode}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-border/40 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            {selectMode ? <X className="w-4 h-4" /> : <SquareCheck className="w-4 h-4" />}
            {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={runTriage}
            disabled={triaging || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${triaging ? "animate-spin" : ""}`} />
            {triaging ? "Analyzing..." : "Re-triage"}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4" style={{ animation: "fade-up 0.2s ease-out both" }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by subject, sender, or content…"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-muted/30 border border-border/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 placeholder:text-muted-foreground/50 transition-all"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Search results */}
      {searchQuery.trim().length > 1 && (
        <div style={{ animation: "fade-up 0.2s ease-out both" }}>
          <p className="text-xs text-muted-foreground mb-3 px-1">
            {searchResults.length === 0
              ? "No emails match your search"
              : `${searchResults.length} result${searchResults.length > 1 ? "s" : ""}`}
          </p>
          <div className="space-y-2">
            {searchResults.map(email => (
              <div key={email.id} className="relative">
                <div className="absolute top-3 right-3 z-10">
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {email.category.replace("_", " ")}
                  </span>
                </div>
                <EmailCard
                  email={email}
                  onCategoryChange={updateEmailCategory}
                  onArchive={handleArchive}
                  onMarkRead={markEmailRead}
                  onSnooze={setSnoozeTarget}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hide tabs + list when searching */}
      {searchQuery.trim().length > 1 ? null : <>

      {/* Category Tabs — counts show only pending (un-replied) */}
      <div className="grid grid-cols-4 gap-2 mb-6" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = stats[tab.id as keyof typeof stats] || 0;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`glass-card rounded-xl p-3 text-center transition-all duration-200 ${
                isActive ? `ring-2 ${tab.ring} ${tab.bg}` : "hover:bg-muted/50"
              }`}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${tab.color}`} />
              <p className="text-xl font-bold text-foreground">{count}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tab.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* Skeleton loading */}
      {loading && totalProcessed === 0 && (
        <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out both" }}>
          {Array.from({ length: 4 }).map((_, i) => <EmailSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && pendingEmails.length === 0 && repliedEmails.length === 0 && totalProcessed > 0 && (
        <div className="glass-card rounded-2xl p-10 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${activeTabConfig.bg}`}>
            <activeTabConfig.icon className={`w-7 h-7 ${activeTabConfig.color} opacity-60`} />
          </div>
          <p className="text-foreground font-medium mb-1">All clear</p>
          <p className="text-sm text-muted-foreground">No {activeTabConfig.label.toLowerCase()} emails right now</p>
        </div>
      )}

      {/* Pinned top-priority section — P8+ urgent only */}
      {activeTab === "urgent" && (() => {
        const pinned = pendingEmails.filter(e => (e.priority_score ?? 0) >= 8);
        if (pinned.length === 0) return null;
        return (
          <div className="mb-5" style={{ animation: "fade-up 0.2s ease-out both" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Top Priority
              </span>
              <div className="flex-1 h-px bg-destructive/20" />
            </div>
            <div className="space-y-2">
              {pinned.map(e => <EmailCard key={e.id} email={e} onCategoryChange={updateEmailCategory} onArchive={handleArchive} onMarkRead={markEmailRead} onSnooze={setSnoozeTarget} onLongPress={enterSelectMode} selectMode={selectMode} isSelected={selectedIds.has(e.id)} onSelect={toggleSelect} />)}
            </div>
          </div>
        );
      })()}

      {/* Time-grouped email list — exclude pinned P8+ from urgent tab */}
      {pendingEmails.length > 0 && (() => {
        const toShow = activeTab === "urgent"
          ? pendingEmails.filter(e => (e.priority_score ?? 0) < 8)
          : pendingEmails;
        if (toShow.length === 0) return null;
        return (
          <div style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
            <GroupedEmailList emails={toShow} onCategoryChange={updateEmailCategory} onArchive={handleArchive} onMarkRead={markEmailRead} onSnooze={setSnoozeTarget} onLongPress={enterSelectMode} selectMode={selectMode} selectedIds={selectedIds} onSelect={toggleSelect} />
          </div>
        );
      })()}

      {/* Replied section */}
      <RepliedSection emails={repliedEmails} onCategoryChange={updateEmailCategory} onArchive={handleArchive} onMarkRead={markEmailRead} onSnooze={setSnoozeTarget} />

      {/* Snoozed section */}
      <SnoozedSection emails={snoozedEmails} onUnsnooze={unsnoozeEmail} />

      {/* Close search conditional */}
      </>}

      {/* Snooze sheet */}
      {snoozeTarget && (
        <SnoozeSheet
          email={snoozeTarget}
          onClose={() => setSnoozeTarget(null)}
          onSnooze={(email, until) => { snoozeEmail(email, until); setSnoozeTarget(null); toast({ title: "Email snoozed", description: `Wakes up ${snoozeLabel(until.toISOString())}`, duration: 3000 }); }}
        />
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-4 right-4 max-w-3xl mx-auto z-50"
          >
            <div className="bg-card border border-border/50 rounded-2xl shadow-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-sm font-semibold text-foreground flex-1">
                  {selectedIds.size === 0 ? "Select emails" : `${selectedIds.size} selected`}
                </span>
                <button onClick={selectAll} className="text-xs text-accent hover:text-accent/80 font-medium px-2 py-1 rounded-lg hover:bg-accent/5 transition-colors">
                  Select all
                </button>
                <button onClick={exitSelectMode} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={bulkArchive}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-border/40 hover:border-destructive/30 hover:bg-destructive/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Archive className="w-4 h-4 text-destructive" />
                  <span className="text-[10px] font-medium text-muted-foreground">Archive</span>
                </button>
                <button
                  onClick={bulkMarkRead}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-border/40 hover:border-accent/30 hover:bg-accent/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <CheckCheckIcon className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-medium text-muted-foreground">Mark read</span>
                </button>
                {(["urgent", "needs_reply", "fyi", "newsletter"] as const).filter(c => c !== activeTab).slice(0, 2).map(cat => (
                  <button
                    key={cat}
                    onClick={() => bulkMove(cat)}
                    disabled={selectedIds.size === 0 || bulkMoving}
                    className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-border/40 hover:border-muted-foreground/30 hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <MoveRight className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground capitalize">{cat.replace("_", " ")}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose modal */}
      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}
    </div>
  );
};