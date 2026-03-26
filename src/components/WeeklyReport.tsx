import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock, TrendingUp, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const WeeklyReport = () => {
  const { agentName } = useAgent();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ agentName }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate report");
      }
      const data = await resp.json();
      setReport(data.report);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const copyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    setCopied(true);
    toast.success("Report copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Mock stats for before generation
  const stats = [
    { label: "Tasks Completed", value: "18", icon: CheckCircle2, color: "text-primary" },
    { label: "Emails Handled", value: "47", icon: FileText, color: "text-accent" },
    { label: "Meetings Attended", value: "12", icon: Clock, color: "text-muted-foreground" },
    { label: "Decisions Made", value: "4", icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-2">Weekly Report</h1>
          <p className="text-muted-foreground">
            {agentName} summarizes your week — accomplishments, pending items, and priorities.
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Report content */}
      {report ? (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-foreground">Week of {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</h2>
            <button onClick={copyReport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </div>
      ) : !loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-xl text-foreground mb-2">Ready to generate</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Click "Generate Report" and {agentName} will compile your weekly summary from emails, meetings, and tasks.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-xl text-foreground mb-2">Compiling your week…</h2>
          <p className="text-sm text-muted-foreground">Analyzing emails, meetings, and tasks</p>
        </div>
      )}
    </div>
  );
};
