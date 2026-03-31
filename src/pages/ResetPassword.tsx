import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ArrowRight, Sparkles, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Allow access if redirected here with recovery hash or from PASSWORD_RECOVERY event
    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      // Check if we got here via a valid session with recovery — give a brief grace period
      const timeout = setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) navigate("/auth", { replace: true });
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-accent/[0.04] blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-3xl translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6 ring-1 ring-accent/15">
            <Sparkles className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display text-4xl text-foreground mb-2 tracking-tight">
            Set new password
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter your new password below
          </p>
        </div>

        {success ? (
          <div className="bg-card rounded-2xl border border-border/40 p-7 text-center space-y-3 shadow-sm">
            <CheckCircle className="w-10 h-10 text-success mx-auto" />
            <p className="text-foreground font-semibold">Password updated!</p>
            <p className="text-sm text-muted-foreground">Redirecting you now…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border/40 p-7 space-y-5 shadow-sm">
            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-2 block uppercase tracking-wider">New password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 transition-all text-sm"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-2 block uppercase tracking-wider">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 transition-all text-sm"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all duration-200 disabled:opacity-60 shadow-md hover:shadow-lg"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  Update password
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
