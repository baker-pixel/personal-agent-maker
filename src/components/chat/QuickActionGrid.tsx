import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { QuickAction } from "../OrchestratorChat";

const MOBILE_VISIBLE_COUNT = 6;

interface QuickActionGridProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionGrid = ({ actions, onAction }: QuickActionGridProps) => {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);

  const visibleActions = isMobile && !expanded ? actions.slice(0, MOBILE_VISIBLE_COUNT) : actions;
  const hasMore = isMobile && actions.length > MOBILE_VISIBLE_COUNT;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 w-full">
        {visibleActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => onAction(action)}
              className="group relative flex flex-col items-start gap-3 p-4 rounded-2xl bg-card border border-border/40 hover:border-accent/20 transition-all duration-300 text-left overflow-hidden animate-fade-up"
              style={{ animationDelay: `${0.3 + i * 0.05}s` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center group-hover:bg-accent/10 transition-all duration-300 group-hover:scale-105">
                <Icon className={`w-[18px] h-[18px] ${action.color} opacity-70 group-hover:opacity-100 transition-all duration-300`} />
              </div>
              <span className="relative text-[13px] font-medium text-foreground/80 group-hover:text-foreground leading-tight transition-colors duration-200">
                {action.label}
              </span>
              <div className="absolute bottom-0 left-4 right-4 h-[2px] bg-accent/0 group-hover:bg-accent/30 transition-all duration-300 rounded-full" />
            </button>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 border border-border/30 transition-all duration-200"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>Show {actions.length - MOBILE_VISIBLE_COUNT} more <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
};
