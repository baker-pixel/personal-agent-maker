import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

// Popup mode  : exchange code → show done/error UI → try window.close()
// Full-page   : exchange code → navigate back to app

type Phase = "working" | "done" | "error";

const GoogleCallback = () => {
  const navigate = useNavigate();

  const sp       = new URLSearchParams(window.location.search);
  const rawState = sp.get("state") ?? "";
  const isPopup  = rawState.endsWith("|popup");

  const [phase,    setPhase]    = useState<Phase>("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const code     = sp.get("code");
    const oauthErr = sp.get("error") ?? null;

    const fail = (msg: string) => {
      if (mounted) { setPhase("error"); setErrorMsg(msg); }
    };

    if (isPopup) {
      // ── Popup: exchange code, show result ──────────────────────────────
      const run = async () => {
        if (oauthErr) { fail(`Authorization denied (${oauthErr}).`);  return; }
        if (!code)    { fail("Missing authorization code.");           return; }

        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { fail("You must be signed in."); return; }

        const provider = rawState.slice(0, rawState.lastIndexOf("|"));
        const { data, error } = await supabase.functions.invoke("nylas-callback", {
          body: { code, provider, redirectUrl: window.location.origin },
        });
        if (!mounted) return;

        if (data?.error || error) {
          fail(data?.error || error?.message || "Failed to connect.");
        } else {
          setPhase("done");
          try { window.close(); } catch {} // best-effort; may fail after COOP
        }
      };
      run().catch(err => fail(err?.message || "Unexpected error."));

    } else {
      // ── Full-page: exchange code, navigate back ────────────────────────
      const run = async () => {
        try {
          if (oauthErr)           { fail(`Authorization denied (${oauthErr}).`);  return; }
          if (!code || !rawState) { fail("Missing authorization code.");           return; }

          const { data: { session } } = await supabase.auth.getSession();
          if (!mounted) return;
          if (!session) { fail("You must be signed in to connect integrations."); return; }

          const { data, error } = await supabase.functions.invoke("nylas-callback", {
            body: { code, provider: rawState, redirectUrl: window.location.origin },
          });
          if (!mounted) return;

          if (error || data?.error) {
            fail(data?.error || error?.message || "Failed to connect.");
            return;
          }

          const returnTo = sessionStorage.getItem("oauth-return-to") || "/dashboard";
          sessionStorage.removeItem("oauth-return-to");
          navigate(returnTo, { replace: true });
        } catch (err: any) {
          fail(err?.message || "Something went wrong.");
        }
      };
      run();
    }

    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Popup UI ───────────────────────────────────────────────────────────
  if (isPopup) {
    if (phase === "done") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-4" />
            <p className="text-foreground font-semibold">Connected!</p>
            <p className="text-sm text-muted-foreground mt-1">You can close this tab.</p>
            <button
              onClick={() => { try { window.close(); } catch {} }}
              className="mt-5 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Close tab
            </button>
          </div>
        </div>
      );
    }
    if (phase === "error") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
            <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-medium">{errorMsg}</p>
            <button
              onClick={() => { try { window.close(); } catch {} }}
              className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Close
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
  }

  // ── Full-page error UI ─────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center">
          <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <p className="text-foreground font-medium">{errorMsg}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Back to app
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
