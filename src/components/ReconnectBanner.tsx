import { AlertTriangle, RefreshCw } from "lucide-react";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";

interface ReconnectBannerProps {
  service: "gmail" | "google-calendar";
  message?: string;
}

export const ReconnectBanner = ({ service, message }: ReconnectBannerProps) => {
  const { connecting, connect } = useGoogleOAuthPopup();
  const label = service === "gmail" ? "Gmail" : "Google Calendar";

  return (
    <div className="glass-card rounded-2xl p-6 border border-destructive/20 bg-destructive/5">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-destructive/10 p-2.5 shrink-0">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {label} session expired
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {message || `Your ${label} connection needs to be refreshed. Please reconnect to continue.`}
          </p>
          <button
            onClick={() => connect(service)}
            disabled={connecting === service}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {connecting === service ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {connecting === service ? "Reconnecting..." : `Reconnect ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
};
