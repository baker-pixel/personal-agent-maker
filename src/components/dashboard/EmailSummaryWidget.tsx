import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, AlertTriangle, MessageSquareReply, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Counts {
  urgent: number;
  needs_reply: number;
}

export default function EmailSummaryWidget() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts>({ urgent: 0, needs_reply: 0 });
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchCounts = async () => {
    const [urgentRes, replyRes] = await Promise.all([
      supabase
        .from("email_metadata")
        .select("id", { count: "exact", head: true })
        .eq("category", "urgent")
        .eq("is_unread", true),
      supabase
        .from("email_metadata")
        .select("id", { count: "exact", head: true })
        .eq("category", "needs_reply")
        .eq("is_unread", true),
    ]);
    setCounts({
      urgent: urgentRes.count ?? 0,
      needs_reply: replyRes.count ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchCounts();

    channelRef.current = supabase
      .channel("email_summary_widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_metadata" }, fetchCounts)
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  if (loading) return null;

  const total = counts.urgent + counts.needs_reply;

  return (
    <button
      onClick={() => navigate("/email")}
      className="w-full text-left glass-card rounded-2xl p-5 hover:border-accent/40 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" />
          <h3 className="font-display text-base text-foreground">Inbox</h3>
          {total > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {total} unread
            </span>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">All caught up — inbox is clear.</p>
      ) : (
        <div className="space-y-1.5">
          {counts.urgent > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span className="flex-1 text-foreground">
                {counts.urgent} urgent email{counts.urgent !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {counts.needs_reply > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <MessageSquareReply className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="flex-1 text-foreground">
                {counts.needs_reply} need{counts.needs_reply === 1 ? "s" : ""} reply
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
