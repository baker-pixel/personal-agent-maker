import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const GoogleCallback = () => {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing Google sign-in...");
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const provider = params.get("state"); // We stored provider in state param

      if (!code || !provider) {
        setStatus("error");
        setMessage("Missing authorization code or provider.");
        return;
      }

      // Get the current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("error");
        setMessage("You must be logged in to connect integrations.");
        return;
      }

      // Exchange the code via our edge function
      const { data, error } = await supabase.functions.invoke("google-callback", {
        body: {
          code,
          provider,
          redirectUrl: window.location.origin,
        },
      });

      if (error || data?.error) {
        setStatus("error");
        setMessage(data?.error || error?.message || "Failed to connect.");
        return;
      }

      setStatus("success");
      setMessage(`Connected ${provider === "gmail" ? "Gmail" : "Google Calendar"} as ${data.email}`);

      // Store connected state
      const saved = localStorage.getItem("integrations-state");
      const connectedIds: string[] = saved ? JSON.parse(saved) : [];
      if (!connectedIds.includes(provider)) {
        connectedIds.push(provider);
        localStorage.setItem("integrations-state", JSON.stringify(connectedIds));
      }

      // If opened as popup, close after brief success message; otherwise redirect
      const isPopup = window.opener && window.opener !== window;
      if (isPopup) {
        setTimeout(() => window.close(), 1500);
      } else {
        setTimeout(() => navigate("/"), 2000);
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
