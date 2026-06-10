import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/contexts/AppStateContext";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";

// Routes where the banner would be noise (user is mid-auth or mid-onboarding).
const HIDDEN_PREFIXES = ["/auth", "/onboarding", "/reset-password", "/", "/pricing", "/investors", "/privacy", "/terms"];

const isHiddenRoute = (pathname: string) =>
  HIDDEN_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));

/**
 * Global banner shown when a Google grant has gone expired/revoked
 * (set by the nylas-webhook on grant.expired / grant.deleted).
 * Reconnecting upserts the same nylas_grants row back to status='valid',
 * so the banner clears itself after a successful reconnect.
 */
export const GrantExpiredBanner = () => {
  const { state } = useAppState();
  const location = useLocation();
  const { connecting, connect } = useGoogleOAuthPopup();
  const [expiredEmails, setExpiredEmails] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const authenticated = !!state.session;

  const fetchExpired = useCallback(async () => {
    if (!authenticated) {
      setExpiredEmails([]);
      return;
    }
    const { data } = await supabase
      .from("nylas_grants")
      .select("email, status")
      .neq("status", "valid");
    const emails = [...new Set((data ?? []).map((g) => g.email).filter(Boolean))] as string[];
    setExpiredEmails(emails);
    if (emails.length === 0) setDismissed(false); // re-arm for future expiries
  }, [authenticated]);

  useEffect(() => {
    fetchExpired();
  }, [fetchExpired]);

  // Re-check on tab focus — same eventual-consistency pattern as IntegrationsContext.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchExpired(), 500);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") debounced();
    };
    window.addEventListener("focus", debounced);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", debounced);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [fetchExpired]);

  const handleReconnect = async () => {
    await connect("gmail");
    await fetchExpired();
  };

  if (!authenticated || dismissed || expiredEmails.length === 0 || isHiddenRoute(location.pathname)) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-destructive/20 bg-destructive/10 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
          Google connection expired for{" "}
          <span className="font-medium">{expiredEmails.join(", ")}</span> — email and calendar
          features are paused until you reconnect.
        </p>
        <button
          onClick={handleReconnect}
          disabled={connecting === "gmail"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${connecting === "gmail" ? "animate-spin" : ""}`} />
          {connecting === "gmail" ? "Reconnecting..." : "Reconnect"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
