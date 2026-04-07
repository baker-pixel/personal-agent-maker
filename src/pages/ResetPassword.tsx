import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import normyLogo from "@/assets/normy-logo.png";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  useEffect(() => {
    // Wait for the recovery session to be fully established
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        // Listen for the session to appear (recovery token processing)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (session) {
              setSessionReady(true);
              subscription.unsubscribe();
            }
          }
        );
        // Timeout after 10s
        setTimeout(() => {
          if (!sessionReady) {
            toast({ title: "Session expired", description: "Please request a new reset link.", variant: "destructive" });
            navigate("/auth");
          }
        }, 10000);
      }
    };
    checkSession();
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
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={normyLogo} alt="Normy" className="h-10 w-auto" />
          <span className="font-display text-2xl font-bold" style={{ color: "#1e3a5f" }}>Agent</span>
        </div>
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
      </motion.div>
    </div>
  );
}
