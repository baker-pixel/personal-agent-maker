import { forwardRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  clearStoredPasswordRecoveryParams,
  getPasswordRecoveryParams,
  loadStoredPasswordRecoveryParams,
  savePasswordRecoveryParams,
} from "@/lib/passwordRecovery";
import normyLogo from "@/assets/normy-logo.png";

type RecoveryStatus = "checking" | "ready" | "needs-link";

const ResetPassword = forwardRef<HTMLDivElement>(function ResetPassword(_props, ref) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("checking");
  const [resetComplete, setResetComplete] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const markReady = () => {
      window.history.replaceState({}, "", "/reset-password");
      setLinkError("");
      setRecoveryStatus("ready");
    };

    const needNewLink = (message = "Enter your email and we'll send a fresh reset link.") => {
      setLinkError(message);
      setRecoveryStatus("needs-link");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (session && getPasswordRecoveryParams().isResetPath)) {
        markReady();
      }
    });

    const init = async () => {
      try {
        const { code, accessToken, refreshToken, tokenHash, errorDesc, errorCode } = getPasswordRecoveryParams();

        if (errorDesc || errorCode) {
          setLinkError(errorDesc ? decodeURIComponent(errorDesc).replace(/\+/g, " ") : "That reset link is no longer valid. Send a new one below.");
          setRecoveryStatus("needs-link");
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
            else needNewLink("That reset link could not be verified. Send a new one below.");
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
            else needNewLink("That reset link could not be verified. Send a new one below.");
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
            else needNewLink("That reset link could not be verified. Send a new one below.");
            return;
          }
          markReady();
          return;
        }

        const { data: existing } = await supabase.auth.getSession();
        if (cancelled) return;
        if (existing.session) {
          markReady();
          return;
        }

        needNewLink();
      } catch (err) {
        console.error("[ResetPassword] init error", err);
        if (!cancelled) needNewLink("Something went wrong verifying that link. Send a new one below.");
      }
    };

    init();

    const timer = setTimeout(() => {
      if (cancelled) return;
      setRecoveryStatus((status) => {
        if (status === "checking") {
          setLinkError("This reset link is taking too long to verify. Send a fresh one below.");
          return "needs-link";
        }
        return status;
      });
    }, 30000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setRecoveryStatus("needs-link");
      setLinkError("Your reset session expired. Send a fresh reset link below.");
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

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (error) {
      toast({ title: "Could not send reset link", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reset link sent", description: "Open the newest email we just sent you." });
    }
  };

  return (
    <div ref={ref} className="min-h-screen bg-background flex items-center justify-center px-5">
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
        ) : recoveryStatus === "needs-link" ? (
          <form onSubmit={handleSendResetLink} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Reset password</h2>
            {linkError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {linkError}
              </div>
            )}
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={resending}>
              {resending ? "Sending…" : "Send New Reset Link"}
            </Button>
            <Link to="/auth" className="block text-sm text-accent hover:underline text-center">
              Back to sign in
            </Link>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Set new password</h2>
            {recoveryStatus === "checking" && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Verifying reset link…
              </div>
            )}
            <Input type="password" placeholder="New password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={recoveryStatus !== "ready"} />
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading || recoveryStatus !== "ready"}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
});

export default ResetPassword;
