import { useNavigate } from "react-router-dom";
import { Clock, ArrowRight, RefreshCw } from "lucide-react";
import { useFollowUpEmails } from "@/hooks/useFollowUpEmails";

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const hrs = Math.floor(diff / 3_600_000);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

export function FollowUpSection() {
  const navigate = useNavigate();
  const { emails, loading, refetch } = useFollowUpEmails();

  if (loading || emails.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl overflow-hidden" style={{ animation: "fade-up 0.3s ease-out both" }}>
      <div className="px-4 pt-4 pb-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
          </div>
          <h3 className="font-display text-sm font-semibold text-foreground">Awaiting Reply</h3>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">
            {emails.length} no response
          </span>
        </div>
        <button onClick={refetch} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          You replied to these emails 48h+ ago — no response yet.
        </p>
        {emails.map(email => (
          <button
            key={email.id}
            onClick={() => navigate("/email")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left group"
          >
            <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {email.from_name || email.from_address}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {email.subject || "(no subject)"} · replied {timeAgo(email.replied_at)}
              </p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
