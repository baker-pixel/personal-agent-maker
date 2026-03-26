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
  <div className="mb-10 text-center">
    <div className="w-16 h-16 rounded-2xl bg-primary/8 ring-1 ring-primary/10 flex items-center justify-center mx-auto mb-6">
      <Sparkles className="w-7 h-7 text-primary" />
    </div>
    <h1 className="font-display text-3xl md:text-4xl text-foreground mb-3 tracking-tight">
      {getGreeting()}
    </h1>
    <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
      I'm {agentName} — your executive assistant.
      <br />
      <span className="text-muted-foreground/70">Ask me anything or pick a quick action below.</span>
    </p>
  </div>
);
