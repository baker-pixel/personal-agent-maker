import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, ArrowRight, Sparkles, ArrowLeft } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (isForgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a password reset link.");
      setLoading(false);
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a confirmation link.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-accent/[0.04] blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-3xl translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6 ring-1 ring-accent/15 animate-float">
            <Sparkles className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display text-4xl text-foreground mb-2 tracking-tight">
            {isForgot ? "Reset password" : isLogin ? "Welcome back" : "Get started"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isForgot ? "We'll send you a reset link" : isLogin ? "Sign in to your executive assistant" : "Create your account to begin"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border/40 p-7 space-y-5 shadow-sm">
          <div>
            <label className="text-xs font-semibold text-foreground/80 mb-2 block uppercase tracking-wider">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 transition-all text-sm"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          {!isForgot && (
            <div>
              <label className="text-xs font-semibold text-foreground/80 mb-2 block uppercase tracking-wider">Password</label>
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
              {isLogin && (
                <button
                  type="button"
                  onClick={() => { setIsForgot(true); setError(""); setMessage(""); }}
                  className="text-xs text-accent hover:underline mt-2 block ml-auto"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-2.5">{error}</p>
          )}
          {message && (
            <p className="text-sm text-success bg-success/5 border border-success/10 rounded-xl px-4 py-2.5">{message}</p>
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
                {isForgot ? "Send reset link" : isLogin ? "Sign in" : "Create account"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}
            className="text-accent hover:underline font-semibold"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;
