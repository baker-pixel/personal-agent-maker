import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const GoogleCallback = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing Google sign-in...");
  const navigate = useNavigate();
  const { refreshConnections } = useIntegrations();

  useEffect(() => {
    // Parse popup flag from state param — encoded by nylas-auth as "service|popup".
    // This is the only reliable indicator because Google/Nylas set COOP headers that
    // sever window.opener after cross-origin navigation, making it unreliable.
    const urlParams = new URLSearchParams(window.location.search);
    const rawState = urlParams.get("state") ?? "";
    const isPopupFlow = rawState.endsWith("|popup");

    // window.opener may be non-null for full-page flows too, so we use isPopupFlow
    // as the primary signal and window.opener as a belt-and-braces fallback.
    const hasOpener = !!(window.opener && window.opener !== window);

    const broadcast = (payload: Record<string, unknown>) => {
      // BroadcastChannel works even when window.opener is null (COOP).
      try {
        const bc = new BroadcastChannel("normy-oauth");
        bc.postMessage(payload);
        bc.close();
      } catch {}
      // Legacy postMessage for browsers without BroadcastChannel
      if (hasOpener) {
        try { window.opener.postMessage(payload, window.location.origin); } catch {}
      }
    };

    const fail = (msg: string) => {
      setStatus("error");
      setMessage(msg);
      broadcast({ type: "normy-google-oauth-complete", success: false, error: msg });
      if (isPopupFlow || hasOpener) setTimeout(() => window.close(), 2000);
    };

    const handleCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const oauthError = params.get("error");

        // Strip "|popup" suffix to get the actual service id
        const provider = isPopupFlow ? rawState.slice(0, rawState.lastIndexOf("|")) : rawState;

        if (oauthError) {
          fail(`Authorization was denied (${oauthError}).`);
          return;
        }
        if (!code || !provider) {
          fail("Missing authorization code or provider.");
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          fail("You must be signed in to connect integrations.");
          return;
        }

        const { data, error } = await supabase.functions.invoke("nylas-callback", {
          body: { code, provider, redirectUrl: window.location.origin },
        });

        if (error || data?.error) {
          fail(data?.error || error?.message || "Failed to connect.");
          return;
        }

        setStatus("success");
        setMessage(`Connected ${provider === "gmail" ? "Gmail" : "Google Calendar"} as ${data.email}`);

        // Update local integration cache (legacy)
        try {
          const saved = localStorage.getItem("integrations-state");
          const connectedIds: string[] = saved ? JSON.parse(saved) : [];
          if (!connectedIds.includes(provider)) {
            connectedIds.push(provider);
            localStorage.setItem("integrations-state", JSON.stringify(connectedIds));
          }
        } catch {}

        broadcast({
          type: "normy-google-oauth-complete",
          success: true,
          service: provider,
          email: data.email,
        });

        if (isPopupFlow || hasOpener) {
          // Popup flow: parent already received the broadcast, just close.
          setTimeout(() => window.close(), 1200);
        } else {
          // Full-page redirect flow (popup was blocked entirely).
          refreshConnections().catch(() => {});
          const returnTo = sessionStorage.getItem("oauth-return-to") || "/dashboard";
          sessionStorage.removeItem("oauth-return-to");
          setTimeout(() => navigate(returnTo), 1500);
        }
      } catch (err) {
        console.error("GoogleCallback error:", err);
        fail((err as Error)?.message || "Something went wrong completing sign-in.");
      }
    };

    handleCallback();
  }, [navigate]);

  const isPopupFlow = new URLSearchParams(window.location.search).get("state")?.endsWith("|popup");
  const isPopupLike = isPopupFlow || !!(window.opener && window.opener !== window);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
            <p className="text-foreground font-medium">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-4" />
            <p className="text-foreground font-medium">{message}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {isPopupLike ? "This window will close…" : "Redirecting..."}
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-medium">{message}</p>
            <button
              onClick={() => isPopupLike ? window.close() : navigate("/")}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {isPopupLike ? "Close" : "Back to app"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GoogleCallback;
