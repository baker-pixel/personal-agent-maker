import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import normyLogo from "@/assets/normy-logo.png";

const getResetParams = () => {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const read = (key: string) => url.searchParams.get(key) || hashParams.get(key);

  return {
    url,
    code: read("code"),
    accessToken: read("access_token"),
    refreshToken: read("refresh_token"),
    tokenHash: read("token_hash"),
    errorDesc: read("error_description"),
  };
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED"))) {
        setSessionReady(true);
      }
    });

    const init = async () => {
      try {
        const { url, code, accessToken, refreshToken, tokenHash, errorDesc } = getResetParams();
        const markReady = () => {
          window.history.replaceState({}, "", url.pathname);
          setLinkError("");
          setSessionReady(true);
        };

        if (errorDesc) {
          setLinkError(decodeURIComponent(errorDesc).replace(/\+/g, " "));
          return;
        }

        const { data: existing } = await supabase.auth.getSession();
        if (cancelled) return;
        if (existing.session) {
          markReady();
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (error) {
            const { data: fallback } = await supabase.auth.getSession();
            if (fallback.session) markReady();
            else setLinkError("Please request a new password reset link.");
            return;
          }
          markReady();
          return;
        }

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (cancelled) return;
          if (error) {
            const { data: fallback } = await supabase.auth.getSession();
            if (fallback.session) markReady();
            else setLinkError("Please request a new password reset link.");
            return;
          }
          markReady();
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error) {
            const { data: fallback } = await supabase.auth.getSession();
            if (fallback.session) markReady();
            else setLinkError("Please request a new password reset link.");
            return;
          }
          markReady();
        }
      } catch (err) {
        console.error("[ResetPassword] init error", err);
        if (!cancelled) setLinkError("Please request a new password reset link.");
      }
    };

    init();

    const timer = setTimeout(() => {
      if (cancelled) return;
      setSessionReady((ready) => {
        if (!ready) {
          setLinkError("Please request a new password reset link.");
        }
        return ready;
      });
    }, 20000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.auth.signOut();
      setResetComplete(true);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={normyLogo} alt="Normy" className="h-10 w-auto" />
          <span className="font-display text-2xl font-bold" style={{ color: "#1e3a5f" }}>Agent</span>
        </div>
        {resetComplete ? (
          <div className="text-center space-y-4">
            <h2 className="font-display text-xl font-semibold">Password updated!</h2>
            <p className="text-sm text-muted-foreground">Your password has been successfully reset.</p>
            <Link to="/auth">
              <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90 mt-2">
                Sign in with new password
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Set new password</h2>
            {!sessionReady && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Verifying reset link…
              </div>
            )}
            <Input type="password" placeholder="New password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={!sessionReady} />
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading || !sessionReady}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
