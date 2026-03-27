import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  Newspaper,
  RefreshCw,
  Loader2,
  ExternalLink,
  AlertCircle,
  Tag,
  Check,
  MessageSquare,
  FileText,
  Share2,
  Bookmark,
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

const AVAILABLE_TOPICS = [
  { id: "ai", label: "Artificial Intelligence", emoji: "🤖" },
  { id: "saas", label: "SaaS & Cloud", emoji: "☁️" },
  { id: "fintech", label: "Fintech", emoji: "💳" },
  { id: "healthcare", label: "Healthcare", emoji: "🏥" },
  { id: "cybersecurity", label: "Cybersecurity", emoji: "🔒" },
  { id: "ecommerce", label: "E-Commerce", emoji: "🛒" },
  { id: "cleantech", label: "Clean Energy & Climate", emoji: "🌱" },
  { id: "crypto", label: "Crypto & Web3", emoji: "⛓️" },
  { id: "startups", label: "Startups & VC", emoji: "🚀" },
  { id: "enterprise", label: "Enterprise Tech", emoji: "🏢" },
  { id: "regulation", label: "Tech Regulation & Policy", emoji: "⚖️" },
  { id: "robotics", label: "Robotics & Automation", emoji: "🦾" },
  { id: "gaming", label: "Gaming & Metaverse", emoji: "🎮" },
  { id: "biotech", label: "Biotech & Pharma", emoji: "🧬" },
  { id: "space", label: "Space & Aerospace", emoji: "🛰️" },
  { id: "edtech", label: "EdTech", emoji: "📚" },
];

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
  const [selectedTopics, setSelectedTopics] = useState<string[]>(() => {
    const stored = localStorage.getItem("news_selected_topics");
    return stored ? JSON.parse(stored) : [];
  });

  const toggleTopic = useCallback((id: string) => {
    setSelectedTopics((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      localStorage.setItem("news_selected_topics", JSON.stringify(next));
      return next;
    });
  }, []);

  const fetchNews = async () => {
    if (selectedTopics.length === 0) {
      toast({ title: "Select at least one topic", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const topicLabels = selectedTopics.map(
        (id) => AVAILABLE_TOPICS.find((t) => t.id === id)?.label || id
      );
      const { data, error } = await supabase.functions.invoke("news-monitor", {
        body: { topics: topicLabels },
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
        <button
          onClick={fetchNews}
          disabled={loading || selectedTopics.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {fetched ? "Refresh" : "Scan News"}
        </button>
      </div>

      {/* Topic selector */}
      <div className="glass-card rounded-2xl p-5 mb-6" style={{ animation: "fade-up 0.2s ease-out both" }}>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
          Topics to follow ({selectedTopics.length} selected)
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TOPICS.map((topic) => {
            const isSelected = selectedTopics.includes(topic.id);
            return (
              <button
                key={topic.id}
                onClick={() => toggleTopic(topic.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  isSelected
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <span>{topic.emoji}</span>
                {topic.label}
                {isSelected && <Check className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

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
          <h2 className="font-display text-xl text-foreground mb-2">Select Your Topics</h2>
          <p className="text-muted-foreground text-sm">
            Pick the topics above, then click "Scan News" to get a personalized briefing.
          </p>
        </div>
      )}

      {/* No results */}
      {fetched && articles.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No news found for your topics</p>
        </div>
      )}

      {/* Articles */}
      {fetched && articles.length > 0 && (
        <div className="space-y-6">
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