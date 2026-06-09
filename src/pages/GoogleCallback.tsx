import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, XCircle } from "lucide-react";

// Pure transport layer — no success logic, no toasts, no integration state.
//
// Popup mode:
//   1. Calls nylas-callback (backend marks the grant in DB).
//   2. Broadcasts a hint to the parent: { type: "normy-oauth-hint", error? }.
//   3. Does NOT call window.close() — parent closes the popup via popup.close().
//
// Full-page mode (popup was blocked):
//   1. Calls nylas-callback.
//   2. Navigates back to the app — IntegrationsContext re-fetches on mount.

const GoogleCallback = () => {
  const [displayError, setDisplayError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code      = params.get("code");
    const rawState  = params.get("state") ?? "";
    const oauthErr  = params.get("error") ?? null;

    const isPopup   = rawState.endsWith("|popup");
    const hasOpener = !!(window.opener && window.opener !== window);

    const sendHint = (error: string | null) => {
      const payload = { type: "normy-oauth-hint", error };
      try { const bc = new BroadcastChannel("normy-oauth"); bc.postMessage(payload); bc.close(); } catch {}
      if (hasOpener) try { window.opener.postMessage(payload, window.location.origin); } catch {}
    };

    if (isPopup || hasOpener) {
      // ── Popup transport ─────────────────────────────────────────────────
      const run = async () => {
        if (oauthErr) { sendHint(`Authorization denied (${oauthErr}).`); return; }
        if (!code)    { sendHint("Missing authorization code.");         return; }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { sendHint("You must be signed in."); return; }

        // Strip "|popup" to get the actual provider/service id
        const provider = rawState.slice(0, rawState.lastIndexOf("|"));

        const { data, error } = await supabase.functions.invoke("nylas-callback", {
          body: { code, provider, redirectUrl: window.location.origin },
        });

        // Backend is the sole authority — pass result as hint, parent reads DB
        sendHint(data?.error || error?.message || null);
      };
      run().catch(err => sendHint(err?.message || "Unexpected error."));

    } else {
      // ── Full-page redirect (popup was blocked) ───────────────────────────
      const run = async () => {
        try {
          if (oauthErr)       { setDisplayError(`Authorization denied (${oauthErr}).`); return; }
          if (!code || !rawState) { setDisplayError("Missing authorization code."); return; }

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { setDisplayError("You must be signed in to connect integrations."); return; }

          const { data, error } = await supabase.functions.invoke("nylas-callback", {
            body: { code, provider: rawState, redirectUrl: window.location.origin },
          });

          if (error || data?.error) {
            setDisplayError(data?.error || error?.message || "Failed to connect.");
            return;
          }

          // IntegrationsContext re-fetches on mount when we navigate back
          const returnTo = sessionStorage.getItem("oauth-return-to") || "/dashboard";
          sessionStorage.removeItem("oauth-return-to");
          navigate(returnTo, { replace: true });
        } catch (err: any) {
          setDisplayError(err?.message || "Something went wrong.");
        }
      };
      run();
    }
  }, [navigate]);

  if (displayError) {
    const isPopupLike =
      (new URLSearchParams(window.location.search).get("state") ?? "").endsWith("|popup")
      || !!(window.opener && window.opener !== window);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
          <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <p className="text-foreground font-medium">{displayError}</p>
          <button
            onClick={() => isPopupLike ? window.close() : navigate("/")}
            className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {isPopupLike ? "Close" : "Back to app"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
    </div>
  );
};

export default GoogleCallback;
