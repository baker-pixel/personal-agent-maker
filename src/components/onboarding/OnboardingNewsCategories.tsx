import { useState } from "react";
import { Newspaper, ArrowRight, ArrowLeft } from "lucide-react";

const AVAILABLE_TOPICS = [
  { id: "ai", label: "AI", emoji: "🤖" },
  { id: "saas", label: "SaaS & Cloud", emoji: "☁️" },
  { id: "fintech", label: "Fintech", emoji: "💳" },
  { id: "healthcare", label: "Healthcare", emoji: "🏥" },
  { id: "cybersecurity", label: "Cybersecurity", emoji: "🔒" },
  { id: "ecommerce", label: "E-Commerce", emoji: "🛒" },
  { id: "cleantech", label: "Clean Energy", emoji: "🌱" },
  { id: "crypto", label: "Crypto & Web3", emoji: "⛓️" },
  { id: "startups", label: "Startups & VC", emoji: "🚀" },
  { id: "enterprise", label: "Enterprise Tech", emoji: "🏢" },
  { id: "regulation", label: "Tech Policy", emoji: "⚖️" },
  { id: "robotics", label: "Robotics", emoji: "🦾" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "biotech", label: "Biotech", emoji: "🧬" },
  { id: "space", label: "Space", emoji: "🛰️" },
  { id: "edtech", label: "EdTech", emoji: "📚" },
];

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const OnboardingNewsCategories = ({ onNext, onBack, onSkip }: Props) => {
  const [selected, setSelected] = useState<string[]>(() => {
    const saved = localStorage.getItem("normy_news_topics");
    return saved ? JSON.parse(saved) : [];
  });

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    localStorage.setItem("normy_news_topics", JSON.stringify(selected));
    onNext();
  };

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 animate-fade-up">
          <Newspaper className="w-7 h-7 text-accent" />
        </div>
      </div>

      <div className="text-center mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-3">What do you follow?</h2>
        <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto">
          Pick topics so your assistant can surface relevant news.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 animate-fade-up max-h-[240px] overflow-y-auto" style={{ animationDelay: "0.2s" }}>
        {AVAILABLE_TOPICS.map((topic) => {
          const isSelected = selected.includes(topic.id);
          return (
            <button
              key={topic.id}
              onClick={() => toggle(topic.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                isSelected
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-card border-border/40 text-muted-foreground hover:border-accent/20 hover:text-foreground"
              }`}
            >
              <span>{topic.emoji}</span>
              {topic.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <button
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-md"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
        <div className="flex justify-between">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground py-2 px-3 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground py-2 px-3 transition-colors">
            Skip for now
          </button>
        </div>
      </div>
    </>
  );
};
