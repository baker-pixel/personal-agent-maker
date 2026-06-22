import { forwardRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_RESET_REDIRECT_URL } from "@/lib/passwordRecovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import normyLogo from "@/assets/normy-logo.png";

const Auth = forwardRef<HTMLDivElement>(function Auth(_props, ref) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(
    searchParams.get("mode") === "signup" ? "signup" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState<"reset" | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (!error) return; // App.tsx route guard navigates once session + isOnboarded resolve
    toast({ title: "Login failed", description: error.message, variant: "destructive" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (password.length < 12) {
      toast({ title: "Password too short", description: "Use at least 12 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else if (data.user?.identities?.length === 0) {
      toast({ title: "Account already exists", description: "An account with this email already exists. Try signing in instead.", variant: "destructive" });
    }
    // App.tsx route guard navigates to /onboarding once session + isOnboarded resolve
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEmailSent("reset");
    }
  };

  return (
    <div ref={ref} className="min-h-screen bg-background flex items-center justify-center px-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={normyLogo} alt="Normy" className="h-10 w-auto" />
          <span className="font-display text-2xl font-bold" style={{ color: "#1e3a5f" }}>Agent</span>
        </div>

        {emailSent === "reset" && (
          <div className="text-center space-y-4">
            <h2 className="font-display text-xl font-semibold">Reset link sent</h2>
            <p className="text-sm text-muted-foreground">
              We sent a password reset link to <strong>{email}</strong>. Check your inbox.
            </p>
            <button type="button" onClick={() => { setEmailSent(null); setMode("login"); }} className="text-sm text-accent hover:underline">
              Back to sign in
            </button>
          </div>
        )}

        {!emailSent && mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Welcome back</h2>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => setMode("forgot")} className="text-accent hover:underline">Forgot password?</button>
              <button type="button" onClick={() => setMode("signup")} className="text-accent hover:underline">Create account</button>
            </div>
          </form>
        )}

        {!emailSent && mode === "signup" && (
          <form onSubmit={handleSignup} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Create your account</h2>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} placeholder="Password (min 12 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? "Creating account…" : "Sign Up"}
            </Button>
            <button type="button" onClick={() => setMode("login")} className="text-sm text-accent hover:underline w-full text-center">
              Already have an account? Sign in
            </button>
          </form>
        )}

        {!emailSent && mode === "forgot" && (
          <form onSubmit={handleForgot} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-center mb-2">Reset password</h2>
            <p className="text-sm text-muted-foreground text-center">Enter your email and we'll send a reset link.</p>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link"}
            </Button>
            <button type="button" onClick={() => setMode("login")} className="text-sm text-accent hover:underline w-full text-center">
              Back to sign in
            </button>
          </form>
        )}

        {!emailSent && (
          <button onClick={() => navigate("/")} className="mt-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto">
            <ArrowLeft className="w-3 h-3" /> Back to home
          </button>
        )}
      </motion.div>
    </div>
  );
});

export default Auth;
