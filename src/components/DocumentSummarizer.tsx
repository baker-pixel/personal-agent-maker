import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { FileText, Loader2, Upload, Copy, Check, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const DocumentSummarizer = () => {
  const { agentName } = useAgent();
  const [inputText, setInputText] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSummarize = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setSummary(null);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-summarizer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: inputText, agentName }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to summarize");
      }
      const data = await resp.json();
      setSummary(data.summary);
    } catch (e: any) {
      toast.error(e.message || "Failed to summarize document");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    toast.success("Summary copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Document Summarizer</h1>
        <p className="text-muted-foreground">
          Paste any document or text and {agentName} will create an executive summary with key takeaways.
        </p>
      </div>

      {/* Input */}
      <div className="glass-card rounded-2xl p-5 mb-6">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
          Paste document text
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste your document, article, report, email thread, or any text here..."
          rows={8}
          className="w-full bg-muted/30 rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            {inputText.length.toLocaleString()} characters
          </span>
          <button
            onClick={handleSummarize}
            disabled={loading || !inputText.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Summarizing…" : "Summarize"}
          </button>
        </div>
      </div>

      {/* Output */}
      {summary && (
        <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Executive Summary
            </h2>
            <button onClick={copyToClipboard} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {loading && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-xl text-foreground mb-2">Analyzing document…</h2>
          <p className="text-sm text-muted-foreground">Extracting key points and generating summary</p>
        </div>
      )}
    </div>
  );
};
