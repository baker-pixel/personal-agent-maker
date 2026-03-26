import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const WeeklySummaryWidget = () => {
  const { agentName } = useAgent();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ agentName }),
        }
      );

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Weekly Summary</h2>
        </div>
        {report && (
          <button
            onClick={generateReport}
            disabled={loading}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </div>
      <div className="px-5 pb-5">
        {!report && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <p className="text-xs text-muted-foreground/60">
              Get an AI-generated summary of your week
            </p>
            <button
              onClick={generateReport}
              className="text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Generate Summary
            </button>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2 text-accent/50" />
            <span className="text-xs">Generating weekly summary…</span>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-xs text-destructive">{error}</p>
            <button
              onClick={generateReport}
              className="text-xs font-medium text-accent hover:text-accent/80"
            >
              Try again
            </button>
          </div>
        )}
        {report && !loading && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_ul]:space-y-1 [&_li]:text-muted-foreground">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
};
