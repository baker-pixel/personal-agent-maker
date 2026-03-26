import { Sparkles } from "lucide-react";

interface ChatHeroProps {
  agentName: string;
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const ChatHero = ({ agentName }: ChatHeroProps) => (
  <div className="mb-8 text-center">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
      <Sparkles className="w-7 h-7 text-primary" />
    </div>
    <h1 className="font-display text-2xl md:text-3xl text-foreground mb-1.5">
      {getGreeting()}
    </h1>
    <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
      I'm {agentName} — your executive assistant. Ask me anything or pick a quick action below.
    </p>
  </div>
);
