import { useState, useEffect, FormEvent } from "react";
import { Search, FileText, ExternalLink, Loader2, Sparkles, Mail, HardDrive, ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { toast } from "sonner";

interface FileResult {
  kind: "drive" | "gmail";
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: number | string;
  url: string;
  ownerName?: string;
  ownerEmail?: string;
  subject?: string;
  account: string;
}

const formatSize = (bytes?: number | string) => {
  if (!bytes) return "";
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatDate = (s?: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

const SUGGESTIONS = [
  "PDFs from last week",
  "Contracts I received",
  "Spreadsheets shared by my team",
  "Files from sarah",
  "Anything called proposal",
];

export default function Files() {
  const { agentName } = useAgent();
  const { integrations } = useIntegrations();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setErrors(null);
    try {
      const { data, error } = await supabase.functions.invoke("files-search", { body: { query: q } });
      if (error) throw error;
      if (data.error && !data.results?.length) {
        toast.error(data.error);
        setResults([]);
        return;
      }
      setResults(data.results || []);
      if (data.errors) setErrors(data.errors);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl pt-[var(--header-h)] pb-6 sm:py-10 pl-4 pr-4">
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Files</h1>
          <p className="text-muted-foreground">
            Ask {agentName} to find any file across your Google Drive and email attachments.
          </p>
        </div>

        {/* Safety badge */}
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-foreground">Read-only access</div>
            <div className="text-muted-foreground">
              {agentName} can search and surface your files but <strong>cannot move, rename, or delete</strong> anything. Google enforces this at the permission level.
            </div>
          </div>
        </div>

        {!gmailConnected && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-foreground">Connect Google to search files</div>
              <div className="text-muted-foreground">
                Open the Integrations menu and connect (or reconnect) your Google account to grant Drive read access.
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <form onSubmit={onSubmit} className="mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "the contract Sarah sent me last month"'
              className="w-full pl-12 pr-24 sm:pr-32 py-4 rounded-2xl bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none text-foreground"
            />
            <button
              type="submit"
              disabled={loading || !query.trim() || !gmailConnected}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">{loading ? "Searching" : "Search"}</span>
            </button>
          </div>
        </form>

        {/* Suggestions */}
        {!results && !loading && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Try</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); runSearch(s); }}
                  disabled={!gmailConnected}
                  className="px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-sm text-foreground transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">
                {results.length === 0 ? "No files found" : `${results.length} ${results.length === 1 ? "result" : "results"}`}
              </div>
            </div>

            {errors && (
              <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Some sources had issues: {errors.join(" • ")}
              </div>
            )}

            <div className="space-y-2">
              {results.map((f) => (
                <a
                  key={`${f.kind}-${f.id}`}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-border bg-card hover:border-accent/40 hover:shadow-sm p-3 transition group"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    f.kind === "drive" ? "bg-blue-500/10" : "bg-coral-500/10 bg-accent/10"
                  }`}>
                    {f.kind === "drive" ? (
                      <HardDrive className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Mail className="w-5 h-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground truncate">{f.name}</div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent transition shrink-0" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {f.kind === "drive" ? (
                        <>
                          {f.ownerName && <span>by {f.ownerName} · </span>}
                          {formatDate(f.modifiedTime)}
                          {f.size && <> · {formatSize(f.size)}</>}
                        </>
                      ) : (
                        <>
                          email from {f.ownerName} · {formatDate(f.modifiedTime)}
                          {f.subject && <> · "{f.subject}"</>}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 shrink-0 mt-1">
                    {f.kind === "drive" ? "Drive" : "Gmail"}
                  </span>
                </a>
              ))}
            </div>

            {results.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No files match that search.</p>
                <p className="text-xs mt-1">Try a broader phrase, a sender's name, or a file type.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
