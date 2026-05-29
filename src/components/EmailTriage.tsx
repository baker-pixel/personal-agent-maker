import { useState, useRef, useCallback } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTriagedEmails, type TriagedEmail } from "@/hooks/useTriagedEmails";

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

// ─── Email Card ───────────────────────────────────────────────────────────────

const EmailCard = ({ email, dimmed = false, onCategoryChange }: { email: TriagedEmail; dimmed?: boolean; onCategoryChange?: (id: string, cat: string) => void }) => {
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
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-200 ${
        dimmed ? "opacity-55" : ""
      } ${
        email.is_unread && !email.replied_at ? "ring-1 ring-accent/20" : ""
      }`}
    >
      <button
        onClick={handleExpand}
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
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
                  const labels: Record<string, string> = { urgent: "Urgent", needs_reply: "Needs Reply", fyi: "FYI", newsletter: "Newsletter" };
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
    </div>
  );
};

// ─── Replied Section ──────────────────────────────────────────────────────────

const RepliedSection = ({ emails, onCategoryChange }: { emails: TriagedEmail[]; onCategoryChange: (id: string, cat: string) => void }) => {
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
            <EmailCard key={email.id} email={email} dimmed onCategoryChange={onCategoryChange} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Time-grouped email list ──────────────────────────────────────────────────

const GroupedEmailList = ({ emails, onCategoryChange }: { emails: TriagedEmail[]; onCategoryChange: (id: string, cat: string) => void }) => {
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
              <EmailCard key={email.id} email={email} onCategoryChange={onCategoryChange} />
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
  const [reconnectMessage, setReconnectMessage] = useState("");

  const gmailConnected = isConnected("gmail");
  const { byCategory, loading, refetch, updateEmailCategory } = useTriagedEmails();

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

  return (
    <div className="max-w-3xl mx-auto">
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
        <button
          onClick={runTriage}
          disabled={triaging || loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${triaging ? "animate-spin" : ""}`} />
          {triaging ? "Analyzing..." : "Re-triage"}
        </button>
      </div>

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
              {pinned.map(e => <EmailCard key={e.id} email={e} onCategoryChange={updateEmailCategory} />)}
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
            <GroupedEmailList emails={toShow} onCategoryChange={updateEmailCategory} />
          </div>
        );
      })()}

      {/* Replied section */}
      <RepliedSection emails={repliedEmails} onCategoryChange={updateEmailCategory} />
    </div>
  );
};
