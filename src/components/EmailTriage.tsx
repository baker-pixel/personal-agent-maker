import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TriagedEmail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  isUnread: boolean;
  category: string;
  reason: string;
  draftResponse: string;
  priorityScore: number;
}

interface TriageStats {
  urgent: number;
  needs_reply: number;
  fyi: number;
  newsletter: number;
}

const TABS = [
  { id: "urgent", label: "Urgent", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/30" },
  { id: "needs_reply", label: "Needs Reply", icon: MessageSquareReply, color: "text-accent", bg: "bg-accent/10", ring: "ring-accent/30" },
  { id: "fyi", label: "FYI Only", icon: Eye, color: "text-muted-foreground", bg: "bg-muted", ring: "" },
  { id: "newsletter", label: "Newsletter", icon: Newspaper, color: "text-muted-foreground", bg: "bg-muted", ring: "" },
] as const;

const EmailCard = ({ email, showDraft }: { email: TriagedEmail; showDraft: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const fromName = email.from.replace(/<.*>/, "").trim() || email.from;
  const timeAgo = (() => {
    try {
      const diff = Date.now() - new Date(email.date).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return "";
    }
  })();

  const handleCopy = () => {
    navigator.clipboard.writeText(email.draftResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`glass-card rounded-xl overflow-hidden transition-all duration-200 ${
        email.isUnread ? "ring-1 ring-accent/20" : ""
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {email.isUnread && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground truncate">{fromName}</span>
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </span>
            </div>
            <p className="text-sm text-foreground truncate">{email.subject}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{email.snippet}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {email.priorityScore >= 8 && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                P{email.priorityScore}
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
                <span className="text-xs text-foreground">{fromName}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase w-10 shrink-0">Subj</span>
                <span className="text-xs font-medium text-foreground">{email.subject}</span>
              </div>
              <div className="border-t border-border/20 pt-2 mt-2">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {email.body || email.snippet}
                </p>
              </div>
            </div>
          </div>

          {/* AI Reason */}
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{email.reason}</p>
          </div>

          {/* Draft Response */}
          {showDraft && email.draftResponse && (
            <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Draft Response
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{email.draftResponse}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const EmailTriage = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("urgent");
  const [categories, setCategories] = useState<Record<string, TriagedEmail[]>>({
    urgent: [], needs_reply: [], fyi: [], newsletter: [],
  });
  const [stats, setStats] = useState<TriageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState("");

  const gmailConnected = isConnected("gmail");

  const fetchTriage = async () => {
    setLoading(true);
    setNeedsReconnect(false);
    try {
      const { data, error } = await supabase.functions.invoke("email-triage");
      if (error) throw error;
      if (data?.error) {
        if (data?.code === "RECONNECT_REQUIRED") {
          setNeedsReconnect(true);
          setReconnectMessage(data.error);
          return;
        }
        throw new Error(data.error);
      }

      setCategories(data.categories);
      setStats(data.stats);
      setTotalProcessed(data.totalProcessed);
      if (data.actionItemsCreated > 0) {
        toast({
          title: `${data.actionItemsCreated} action item${data.actionItemsCreated > 1 ? "s" : ""} created`,
          description: `${agentName} extracted tasks from your emails`,
        });
      }
    } catch (err: any) {
      console.error("Triage error:", err);
      // Check for reconnect errors in the error message too
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (gmailConnected) fetchTriage();
  }, [gmailConnected]);

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

  const activeEmails = categories[activeTab] || [];
  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;
  const showDraft = activeTab === "urgent" || activeTab === "needs_reply";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Reconnect Banner */}
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
              {totalProcessed} emails analyzed by {agentName}
            </p>
          )}
        </div>
        <button
          onClick={fetchTriage}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analyzing..." : "Re-triage"}
        </button>
      </div>

      {/* Category Tabs */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-6" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = stats[tab.id as keyof TriageStats] || 0;
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
      )}

      {/* Loading */}
      {loading && totalProcessed === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
          <p className="text-foreground font-medium">{agentName} is reading and categorizing your inbox...</p>
          <p className="text-sm text-muted-foreground mt-1">Analyzing content, senders, and urgency</p>
        </div>
      )}

      {/* Email List */}
      {!loading && activeEmails.length === 0 && stats && (
        <div className="glass-card rounded-2xl p-8 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <activeTabConfig.icon className={`w-10 h-10 mx-auto mb-3 ${activeTabConfig.color} opacity-40`} />
          <p className="text-muted-foreground">No emails in this category</p>
        </div>
      )}

      {activeEmails.length > 0 && (
        <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.1s both" }}>
          {activeEmails.map((email) => (
            <EmailCard key={email.id} email={email} showDraft={showDraft} />
          ))}
        </div>
      )}
    </div>
  );
};
