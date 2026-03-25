import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import ReactMarkdown from "react-markdown";
import {
  Sun,
  Mail,
  Calendar,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Clock,
} from "lucide-react";

interface BriefingStats {
  totalEmails: number;
  unreadEmails: number;
  todayEvents: number;
  gmailConnected: boolean;
  calendarConnected: boolean;
}

interface BriefingEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  isUnread: boolean;
}

interface BriefingEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: string[];
}

export const MorningBriefing = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const [briefing, setBriefing] = useState<string | null>(null);
  const [stats, setStats] = useState<BriefingStats | null>(null);
  const [emails, setEmails] = useState<BriefingEmail[]>([]);
  const [events, setEvents] = useState<BriefingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const hasAnyIntegration = isConnected("gmail") || isConnected("google-calendar");

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("morning-briefing");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setBriefing(data.briefing);
      setStats(data.stats);
      setEmails(data.emails || []);
      setEvents(data.events || []);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Briefing error:", err);
      setError(err.message || "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasAnyIntegration) {
      fetchBriefing();
    }
  }, [hasAnyIntegration]);

  if (!hasAnyIntegration) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-2xl p-8 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Sun className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="font-display text-2xl text-foreground mb-2">Morning Briefing</h2>
          <p className="text-muted-foreground mb-4">
            Connect Gmail or Google Calendar to get your personalized daily briefing from {agentName}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <Sun className="w-8 h-8 text-accent" />
            Morning Briefing
          </h1>
          {lastRefreshed && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchBriefing}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Generating..." : "Refresh"}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
          <div className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.unreadEmails}</p>
              <p className="text-xs text-muted-foreground">Unread</p>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.totalEmails}</p>
              <p className="text-xs text-muted-foreground">Recent</p>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.todayEvents}</p>
              <p className="text-xs text-muted-foreground">Events today</p>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {(stats.gmailConnected ? 1 : 0) + (stats.calendarConnected ? 1 : 0)}
              </p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !briefing && (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground font-medium">{agentName} is analyzing your inbox and calendar...</p>
          <p className="text-sm text-muted-foreground mt-1">This usually takes a few seconds</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-2xl p-6 mb-6 border border-destructive/20" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Couldn't generate briefing</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <button
                onClick={fetchBriefing}
                className="mt-3 text-sm text-accent hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Briefing Content */}
      {briefing && (
        <div className="glass-card rounded-2xl p-6 md:p-8" style={{ animation: "fade-up 0.4s ease-out 0.1s both" }}>
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border/50">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI-Generated Briefing
            </span>
          </div>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-headings:font-display prose-strong:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown>{briefing}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
