import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";

export type GmailStatus = "connected" | "reconnect_required";

interface GmailStatusBannerProps {
  status: GmailStatus;
  lastSyncAt: Date | null;
  message?: string;
}

function formatLastSync(date: Date | null): string {
  if (!date) return "never";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString();
}

export const GmailStatusBanner = ({ status, lastSyncAt, message }: GmailStatusBannerProps) => {
  const { connecting, connect } = useGoogleOAuthPopup();

  if (status === "connected") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-2.5 text-sm"
      >
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="font-medium text-foreground">Gmail connected</span>
        <span className="text-muted-foreground">· last sync {formatLastSync(lastSyncAt)}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">Reconnect Gmail</span>
        <span className="text-muted-foreground">
          {" "}· {message || "Your session expired."}
          {lastSyncAt && <> Last sync {formatLastSync(lastSyncAt)}.</>}
        </span>
      </div>
      <button
        onClick={() => connect("gmail")}
        disabled={connecting === "gmail"}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60 shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${connecting === "gmail" ? "animate-spin" : ""}`} />
        {connecting === "gmail" ? "Reconnecting…" : "Reconnect"}
      </button>
    </div>
  );
};
