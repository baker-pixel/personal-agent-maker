import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Moon,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Mail,
  CalendarDays,
  Copy,
  Check,
  Bot,
  Inbox,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface EodStats {
  meetings_attended: number;
  emails_sent: number;
  tasks_completed: number;
  tasks_open: number;
  tasks_overdue: number;
  tasks_due_tomorrow: number;
  drafts_handled: number;
  drafts_pending: number;
}

interface SentEmail {
  to: string;
  subject: string;
}

interface HandledDraft {
  type: string;
  subject: string | null;
  to_name: string | null;
  to_email: string | null;
  status: string;
}

export const EndOfDayWrapup = () => {
  const { agentName } = useAgent();
  const [summary, setSummary] = useState<string | null>(null);
  const [stats, setStats] = useState<EodStats | null>(null);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [handledDrafts, setHandledDrafts] = useState<HandledDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmails, setShowEmails] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);

  const generateWrapup = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eod-wrapup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSummary(data.summary);
      setStats(data.stats);
      setSentEmails(data.sent_emails || []);
      setHandledDrafts(data.handled_drafts || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate wrap-up");
    } finally {
      setLoading(false);
    }
  };

  const copyWrapup = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    toast.success("Wrap-up copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const statCards = stats
    ? [
        { label: "Meetings", value: stats.meetings_attended, icon: CalendarDays, color: "text-blue-500" },
        { label: "Emails Sent", value: stats.emails_sent, icon: Mail, color: "text-accent" },
        { label: "Tasks Done", value: stats.tasks_completed, icon: CheckCircle2, color: "text-emerald-500" },
        { label: "Still Open", value: stats.tasks_open, icon: Clock, color: "text-muted-foreground" },
        { label: "Agent Handled", value: stats.drafts_handled, icon: Bot, color: "text-violet-500" },
        { label: "Awaiting You", value: stats.drafts_pending, icon: Inbox, color: "text-orange-500" },
      ]
    : [];

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" },
      sent: { label: "Sent", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" },
      dismissed: { label: "Dismissed", cls: "bg-muted text-muted-foreground border-border" },
    };
    const b = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
    return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-2">End-of-Day Wrap-Up</h1>
          <p className="text-muted-foreground">
            {agentName} summarizes your day — what got done, what's still open, and what's urgent for tomorrow.
          </p>
        </div>
        <button
          onClick={generateWrapup}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "Generating…" : summary ? "Refresh" : "Generate Wrap-Up"}
        </button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="glass-card rounded-2xl p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Detail panels: sent emails + agent drafts */}
      {stats && (sentEmails.length > 0 || handledDrafts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Sent emails panel */}
          {sentEmails.length > 0 && (
            <div className="glass-card rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowEmails(!showEmails)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Send className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Emails Sent Today</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sentEmails.length}</span>
                </div>
                {showEmails ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showEmails && (
                <div className="border-t border-border px-4 pb-3 space-y-2">
                  {sentEmails.map((email, i) => (
                    <div key={i} className="flex flex-col py-2 border-b border-border/50 last:border-0">
                      <p className="text-sm font-medium text-foreground truncate">{email.subject || "(No subject)"}</p>
                      <p className="text-xs text-muted-foreground truncate">To: {email.to || "Unknown"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent handled drafts panel */}
          {handledDrafts.length > 0 && (
            <div className="glass-card rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowDrafts(!showDrafts)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-medium text-foreground">{agentName} Handled</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{handledDrafts.length}</span>
                </div>
                {showDrafts ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showDrafts && (
                <div className="border-t border-border px-4 pb-3 space-y-2">
                  {handledDrafts.map((draft, i) => (
                    <div key={i} className="flex items-start justify-between py-2 border-b border-border/50 last:border-0 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{draft.subject || "(No subject)"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {draft.type === "email_reply" ? "Reply" : draft.type} → {draft.to_name || draft.to_email || "Unknown"}
                        </p>
                      </div>
                      {statusBadge(draft.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Wrap-up content */}
      {summary ? (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-foreground">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <button
              onClick={copyWrapup}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      ) : !loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Moon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-xl text-foreground mb-2">Ready to wrap up your day</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Click "Generate Wrap-Up" and {agentName} will compile everything — meetings attended, emails sent, agent-handled drafts, and what needs attention tomorrow.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-xl text-foreground mb-2">Wrapping up your day…</h2>
          <p className="text-sm text-muted-foreground">Reviewing meetings, emails, agent activity, and tasks</p>
        </div>
      )}
    </div>
  );
};
