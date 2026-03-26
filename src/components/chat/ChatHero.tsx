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
  <div className="mb-10 text-center relative">
    {/* Ambient glow */}
    <div className="absolute inset-0 -top-20 pointer-events-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-accent/[0.06] blur-3xl" />
    </div>
    
    <div className="relative">
      <div 
        className="w-18 h-18 rounded-2xl flex items-center justify-center mx-auto mb-7 relative animate-float"
        style={{ width: '4.5rem', height: '4.5rem' }}
      >
        <div className="absolute inset-0 rounded-2xl bg-accent/10 animate-glow-pulse" />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/20" />
        <Sparkles className="w-7 h-7 text-accent relative z-10" />
      </div>
      
      <h1 className="font-display text-4xl md:text-5xl text-foreground mb-3 tracking-tight animate-fade-up">
        {getGreeting()}
      </h1>
      <p className="text-base md:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed animate-fade-up" style={{ animationDelay: '0.1s' }}>
        I'm <span className="font-semibold text-foreground">{agentName}</span> — your executive assistant.
      </p>
      <p className="text-sm text-muted-foreground/60 mt-1.5 animate-fade-up" style={{ animationDelay: '0.2s' }}>
        Ask me anything or pick a quick action below.
      </p>
    </div>
  </div>
);
