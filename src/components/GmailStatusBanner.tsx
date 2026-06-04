import { CheckCircle2, AlertTriangle, RefreshCw, Ban } from "lucide-react";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";

export type GmailStatus = "connected" | "reconnect_required" | "account_blocked";

interface GmailStatusBannerProps {
  status: GmailStatus;
  lastSyncAt?: Date | null;
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
        {lastSyncAt && <span className="text-muted-foreground">· last sync {formatLastSync(lastSyncAt)}</span>}
      </div>
    );
  }

  if (status === "account_blocked") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
      >
        <Ban className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <span className="font-semibold text-foreground">Gmail account blocked</span>
            <p className="text-muted-foreground mt-0.5">
              {message || "This Google account is restricted or blocked. Use a different Google account to connect."}
            </p>
          </div>
          <button
            onClick={() => connect("gmail")}
            disabled={connecting === "gmail"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${connecting === "gmail" ? "animate-spin" : ""}`} />
            {connecting === "gmail" ? "Connecting…" : "Connect a different account"}
          </button>
        </div>
      </div>
    );
  }

  // reconnect_required
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm"
    >
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">Gmail session expired</span>
        <span className="text-muted-foreground">
          {" "}· {message || "Please reconnect to continue syncing."}
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
