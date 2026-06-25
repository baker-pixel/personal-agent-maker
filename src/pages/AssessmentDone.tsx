import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";

export default function AssessmentDone() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "success" | "partial" | "error">("loading");

  useEffect(() => {
    const session = params.get("session");
    const status = params.get("status");

    const save = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate(`/auth?redirect=/assessment-done?session=${session}&status=${status}`, { replace: true });
          return;
        }

        if (session) {
          await supabase.from("user_preferences").upsert(
            {
              user_id: user.id,
              assessment_session_id: session,
              assessment_status: status ?? "unknown",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        }

        setState(status === "success" ? "success" : status === "partial" ? "partial" : "error");

        const origin = localStorage.getItem("assessment_origin");
        localStorage.removeItem("assessment_origin");
        const returnPath = origin === "settings" ? "/settings#profile" : "/onboarding?resumeStep=5";

        setTimeout(() => {
          navigate(returnPath, { replace: true });
        }, 2200);
      } catch {
        setState("error");
        const origin = localStorage.getItem("assessment_origin");
        localStorage.removeItem("assessment_origin");
        setTimeout(() => navigate(origin === "settings" ? "/settings#profile" : "/onboarding?resumeStep=5", { replace: true }), 2500);
      }
    };

    save();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-xs">
        {state === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Saving your results…</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-semibold text-lg">Assessment complete!</p>
            <p className="text-muted-foreground text-sm">Both your DISC and Values scores are saved. Returning to setup…</p>
          </>
        )}
        {state === "partial" && (
          <>
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
            <p className="font-semibold text-lg">Almost there</p>
            <p className="text-muted-foreground text-sm">Some results were saved. You can retake later from Settings. Returning to setup…</p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="text-muted-foreground text-sm">Something went wrong saving your results.</p>
            <p className="text-muted-foreground text-xs">Returning to setup…</p>
          </>
        )}
      </div>
    </div>
  );
}
