import { useState } from "react";
import { Play, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type LogEntry = { level: "info" | "warn" | "error"; message: string; at: string };
type RunResult = {
  ok: boolean;
  logs: LogEntry[];
  error?: string;
  briefing?: { summary: string; email_count: number; meeting_count: number; urgent_items: number };
};

export default function DailyBriefingRunner() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    const startedAt = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("daily-briefing-run-now");
      if (error) throw error;
      setResult(data as RunResult);
    } catch (e: any) {
      setResult({
        ok: false,
        error: e?.message || "Failed to run briefing",
        logs: [{ level: "error", message: e?.message || String(e), at: new Date().toISOString() }],
      });
    } finally {
      setLoading(false);
      // timing log removed for production
    }
  };

  const levelColor = (l: LogEntry["level"]) =>
    l === "error" ? "text-destructive" : l === "warn" ? "text-important" : "text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Daily Briefing
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Runs automatically every morning at 11:00 UTC. Trigger now to regenerate today's briefing.
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="sm" className="shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span className="ml-1.5">{loading ? "Running…" : "Run now"}</span>
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              result.ok
                ? "bg-success/10 text-foreground"
                : "bg-destructive/10 text-foreground border border-destructive/20"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {result.ok ? "Briefing generated successfully" : `Failed: ${result.error}`}
              </p>
              {result.ok && result.briefing && (
                <p className="text-xs text-muted-foreground mt-1">
                  {result.briefing.email_count} emails · {result.briefing.meeting_count} meetings ·{" "}
                  {result.briefing.urgent_items} urgent
                </p>
              )}
            </div>
          </div>

          {result.ok && result.briefing?.summary && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-foreground leading-relaxed">
              {result.briefing.summary}
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
              View logs ({result.logs.length})
            </summary>
            <div className="mt-2 rounded-lg bg-muted/30 p-3 font-mono space-y-1 max-h-64 overflow-auto">
              {result.logs.map((l, i) => (
                <div key={i} className={`flex gap-2 ${levelColor(l.level)}`}>
                  <span className="opacity-60 shrink-0">
                    {new Date(l.at).toLocaleTimeString()}
                  </span>
                  <span className="uppercase shrink-0 w-10">{l.level}</span>
                  <span className="break-all">{l.message}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
