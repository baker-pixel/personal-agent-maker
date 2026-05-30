// @ts-nocheck
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, AlertTriangle, MessageSquareReply, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Counts {
  urgent: number;
  needs_reply: number;
}

// Shared query definition — must match useTodayData and NotificationCenter exactly
// Rule: unreplied + not snoozed = still needs action
async function fetchEmailCounts(): Promise<Counts> {
  const now = new Date().toISOString();
  const [urgentRes, replyRes] = await Promise.all([
    supabase
      .from("email_metadata")
      .select("id", { count: "exact", head: true })
      .eq("category", "urgent")
      .is("replied_at", null)
      .or(`snoozed_until.is.null,snoozed_until.lte.${now}`),
    supabase
      .from("email_metadata")
      .select("id", { count: "exact", head: true })
      .eq("category", "needs_reply")
      .is("replied_at", null)
      .or(`snoozed_until.is.null,snoozed_until.lte.${now}`),
  ]);
  return {
    urgent: urgentRes.count ?? 0,
    needs_reply: replyRes.count ?? 0,
  };
}

export default function EmailSummaryWidget() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts>({ urgent: 0, needs_reply: 0 });
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    const c = await fetchEmailCounts();
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    channelRef.current = supabase
      .channel(`email_summary_widget_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_metadata" }, refresh)
      .subscribe();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [refresh]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-20" />
        <div className="h-8 bg-muted rounded w-12" />
        <div className="space-y-2">
          <div className="h-9 bg-muted rounded-xl" />
          <div className="h-9 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  const total = counts.urgent + counts.needs_reply;

  return (
    <button
      onClick={() => navigate("/email")}
      className="w-full block text-left glass-card rounded-2xl p-5 hover:border-accent/40 transition-all group"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <Mail className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="font-display text-sm font-semibold text-foreground">Inbox</span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            All caught up
          </div>
          <p className="text-xs text-muted-foreground/70">No urgent or pending emails.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {counts.urgent > 0 && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-destructive/5 border border-destructive/15">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-none">
                  {counts.urgent} urgent
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Need immediate attention</p>
              </div>
              <span className="text-lg font-bold text-destructive tabular-nums">{counts.urgent}</span>
            </div>
          )}
          {counts.needs_reply > 0 && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/5 border border-accent/15">
              <MessageSquareReply className="w-4 h-4 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-none">
                  {counts.needs_reply} awaiting reply
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Waiting on your response</p>
              </div>
              <span className="text-lg font-bold text-accent tabular-nums">{counts.needs_reply}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}