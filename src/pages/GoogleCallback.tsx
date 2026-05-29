import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const GoogleCallback = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing Google sign-in...");
  const navigate = useNavigate();

  useEffect(() => {
    const isPopup = window.opener && window.opener !== window;

    // Always notify the parent on terminal outcomes so the Settings page
    // never sits on a "Connecting..." spinner waiting for a message that
    // never arrives. Both success and error paths post to the opener.
    const notifyParent = (payload: Record<string, unknown>) => {
      if (!isPopup) return;
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch (e) {
        console.warn("postMessage to opener failed:", e);
      }
    };

    const fail = (msg: string) => {
      setStatus("error");
      setMessage(msg);
      notifyParent({ type: "normy-google-oauth-complete", success: false, error: msg });
      // Auto-close after a short beat so the parent's popup-closed poll
      // also fires as a belt-and-braces fallback.
      if (isPopup) setTimeout(() => window.close(), 2000);
    };

    const handleCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const provider = params.get("state"); // we stored provider in state
        const oauthError = params.get("error");

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

        // Mark provider as connected in local cache (legacy).
        try {
          const saved = localStorage.getItem("integrations-state");
          const connectedIds: string[] = saved ? JSON.parse(saved) : [];
          if (!connectedIds.includes(provider)) {
            connectedIds.push(provider);
            localStorage.setItem("integrations-state", JSON.stringify(connectedIds));
          }
        } catch {}

        notifyParent({
          type: "normy-google-oauth-complete",
          success: true,
          service: provider,
          email: data.email,
        });

        if (isPopup) {
          setTimeout(() => window.close(), 1200);
        } else {
          setTimeout(() => navigate("/dashboard"), 1500);
        }
      } catch (err) {
        console.error("GoogleCallback error:", err);
        fail((err as Error)?.message || "Something went wrong completing sign-in.");
      }
    };

    handleCallback();
  }, [navigate]);

  const isPopup = window.opener && window.opener !== window;

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
              {isPopup ? "This window will close…" : "Redirecting..."}
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-medium">{message}</p>
            <button
              onClick={() => isPopup ? window.close() : navigate("/")}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {isPopup ? "Close" : "Back to app"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GoogleCallback;
