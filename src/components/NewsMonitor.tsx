import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  Newspaper,
  RefreshCw,
  Loader2,
  ExternalLink,
  AlertCircle,
  Tag,
  Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  topic: string;
  importance: string;
  url: string;
}

const importanceColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-accent/10 text-accent",
  low: "bg-muted text-muted-foreground",
};

export const NewsMonitor = () => {
  const { agentName } = useAgent();
  const { toast } = useToast();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [topics, setTopics] = useState(() => localStorage.getItem("news_topics") || "");

  const fetchNews = async () => {
    setLoading(true);
    try {
      const topicList = topics
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke("news-monitor", {
        body: { topics: topicList.length > 0 ? topicList : undefined },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setArticles(data.articles || []);
      setFetched(true);
    } catch (err: any) {
      toast({
        title: "News fetch failed",
        description: err.message || "Could not load news",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTopics = () => {
    localStorage.setItem("news_topics", topics);
    setShowTopics(false);
    toast({ title: "Topics saved" });
  };

  const highPriority = articles.filter((a) => a.importance === "high");
  const otherArticles = articles.filter((a) => a.importance !== "high");

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <Newspaper className="w-8 h-8 text-accent" />
            Industry News
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {agentName} monitors news relevant to your industry
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTopics(!showTopics)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            title="Configure topics"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={fetchNews}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {fetched ? "Refresh" : "Scan News"}
          </button>
        </div>
      </div>

      {/* Topic config */}
      {showTopics && (
        <div className="glass-card rounded-2xl p-5 mb-6 space-y-3" style={{ animation: "fade-up 0.2s ease-out both" }}>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
            Topics to monitor (comma-separated)
          </label>
          <input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="e.g., AI, SaaS, fintech, healthcare"
            className="w-full bg-muted/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowTopics(false)} className="px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
            <button onClick={saveTopics} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground">Save</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !fetched && (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.4s ease-out both" }}>
          <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
          <p className="text-foreground font-medium">{agentName} is scanning news sources…</p>
          <p className="text-sm text-muted-foreground mt-1">Analyzing relevance and importance</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !fetched && (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <Newspaper className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-display text-xl text-foreground mb-2">Industry News Monitor</h2>
          <p className="text-muted-foreground text-sm">
            Click "Scan News" to have {agentName} find and summarize relevant news for you.
          </p>
          <p className="text-muted-foreground/60 text-xs mt-2">
            Customize topics with the ⚙️ button above
          </p>
        </div>
      )}

      {/* Articles */}
      {fetched && articles.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No news found for your topics</p>
        </div>
      )}

      {fetched && articles.length > 0 && (
        <div className="space-y-6">
          {/* High priority */}
          {highPriority.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-3 px-1">
                🔴 Must Read
              </h2>
              <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out both" }}>
                {highPriority.map((article, i) => (
                  <ArticleCard key={i} article={article} />
                ))}
              </div>
            </div>
          )}

          {/* Other */}
          {otherArticles.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
                Also Noteworthy
              </h2>
              <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
                {otherArticles.map((article, i) => (
                  <ArticleCard key={i} article={article} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ArticleCard = ({ article }: { article: NewsArticle }) => {
  const impColor = importanceColors[article.importance] || importanceColors.low;

  return (
    <div className="glass-card rounded-xl p-4 hover:bg-muted/20 transition-all">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${impColor}`}>
              {article.importance}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Tag className="w-3 h-3" /> {article.topic}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">{article.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{article.summary}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-2">{article.source}</p>
        </div>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-muted-foreground hover:text-accent transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
};
