import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import {
  Clock,
  AlertTriangle,
  Timer,
  CheckCircle2,
  RefreshCw,
  Mail,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FollowUp {
  id: string;
  threadId: string;
  to: string;
  subject: string;
  snippet: string;
  sentDate: string;
  daysSince: number;
  urgency: "overdue" | "due_soon" | "can_wait";
  urgencyReason: string;
  suggestedAction: string;
  draftFollowup: string;
}

interface FollowUpStats {
  total: number;
  overdue: number;
  waiting: number;
}

const urgencyConfig = {
  overdue: {
    label: "Overdue",
    icon: AlertTriangle,
    color: "text-destructive",
    bg: "bg-destructive/10",
    badge: "bg-destructive/10 text-destructive",
  },
  due_soon: {
    label: "Due Soon",
    icon: Timer,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    badge: "bg-amber-500/10 text-amber-600",
  },
  can_wait: {
    label: "Can Wait",
    icon: CheckCircle2,
    color: "text-muted-foreground",
    bg: "bg-muted",
    badge: "bg-muted text-muted-foreground",
  },
};

const FollowUpCard = ({ followUp }: { followUp: FollowUp }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = urgencyConfig[followUp.urgency];
  const UrgencyIcon = config.icon;

  const recipientName = followUp.to.replace(/<.*>/, "").trim() || followUp.to;

  const handleCopy = () => {
    navigator.clipboard.writeText(followUp.draftFollowup);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
            <UrgencyIcon className={`w-4 h-4 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground truncate">{recipientName}</span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${config.badge}`}>
                {config.label}
              </span>
            </div>
            <p className="text-sm text-foreground truncate">{followUp.subject}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Send className="w-3 h-3" />
                Sent {followUp.daysSince} day{followUp.daysSince !== 1 ? "s" : ""} ago
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                No reply
              </span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          {/* Original snippet */}
          <div className="rounded-lg bg-muted/50 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Original Message
            </span>
            <p className="text-xs text-muted-foreground mt-1">{followUp.snippet}</p>
          </div>

          {/* AI analysis */}
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{followUp.urgencyReason}</p>
              <p className="text-xs text-foreground font-medium mt-1">{followUp.suggestedAction}</p>
            </div>
          </div>

          {/* Draft follow-up */}
          <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Suggested Follow-Up
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{followUp.draftFollowup}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export const FollowUpTracker = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { toast } = useToast();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [stats, setStats] = useState<FollowUpStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "overdue" | "due_soon" | "can_wait">("all");

  const gmailConnected = isConnected("gmail");

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("follow-up-tracker");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setFollowUps(data.followUps || []);
      setStats(data.stats || { total: 0, overdue: 0, waiting: 0 });
    } catch (err: any) {
      console.error("Follow-up error:", err);
      toast({
        title: "Follow-up check failed",
        description: err.message || "Could not check follow-ups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (gmailConnected) fetchFollowUps();
  }, [gmailConnected]);

  if (!gmailConnected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-2xl p-8 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Clock className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="font-display text-2xl text-foreground mb-2">Follow-Up Tracker</h2>
          <p className="text-muted-foreground">
            Connect Gmail to let {agentName} detect unanswered emails and suggest follow-ups.
          </p>
        </div>
      </div>
    );
  }

  const filtered = filter === "all" ? followUps : followUps.filter((f) => f.urgency === filter);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <Clock className="w-8 h-8 text-accent" />
            Follow-Up Tracker
          </h1>
          {stats && stats.total > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total} unanswered email{stats.total !== 1 ? "s" : ""} found
            </p>
          )}
        </div>
        <button
          onClick={fetchFollowUps}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
          <button
            onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
            className={`glass-card rounded-xl p-4 text-center transition-all ${
              filter === "overdue" ? "ring-2 ring-destructive/30 bg-destructive/5" : "hover:bg-muted/50"
            }`}
          >
            <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.overdue}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overdue</p>
          </button>
          <button
            onClick={() => setFilter(filter === "due_soon" ? "all" : "due_soon")}
            className={`glass-card rounded-xl p-4 text-center transition-all ${
              filter === "due_soon" ? "ring-2 ring-amber-500/30 bg-amber-500/5" : "hover:bg-muted/50"
            }`}
          >
            <Timer className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.waiting}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due Soon</p>
          </button>
          <button
            onClick={() => setFilter(filter === "can_wait" ? "all" : "can_wait")}
            className={`glass-card rounded-xl p-4 text-center transition-all ${
              filter === "can_wait" ? "ring-2 ring-border" : "hover:bg-muted/50"
            }`}
          >
            <CheckCircle2 className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.total - stats.overdue - stats.waiting}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Can Wait</p>
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && followUps.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
          <p className="text-foreground font-medium">{agentName} is scanning your sent emails...</p>
          <p className="text-sm text-muted-foreground mt-1">Checking for unanswered threads</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && stats && stats.total === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
          <p className="text-foreground font-medium">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No unanswered emails found in the last 7 days.</p>
        </div>
      )}

      {/* Follow-up list */}
      {filtered.length > 0 && (
        <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.1s both" }}>
          {filtered.map((followUp) => (
            <FollowUpCard key={followUp.id} followUp={followUp} />
          ))}
        </div>
      )}

      {/* Filtered empty */}
      {!loading && filter !== "all" && filtered.length === 0 && stats && stats.total > 0 && (
        <div className="glass-card rounded-2xl p-6 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <p className="text-muted-foreground text-sm">
            No emails with "{urgencyConfig[filter].label}" urgency.{" "}
            <button onClick={() => setFilter("all")} className="text-accent hover:underline">
              Show all
            </button>
          </p>
        </div>
      )}
    </div>
  );
};
