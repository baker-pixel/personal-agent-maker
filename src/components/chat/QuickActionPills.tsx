import { Zap } from "lucide-react";
import type { QuickAction } from "../OrchestratorChat";

interface QuickActionPillsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionPills = ({ actions, onAction }: QuickActionPillsProps) => (
  <div className="px-3 md:px-6 py-2">
    <div className="flex items-center gap-1.5 mb-2 px-1">
      <Zap className="w-3 h-3 text-accent" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        What else can I handle?
      </span>
    </div>
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={() => onAction(action)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/20 hover:bg-accent/[0.03] transition-all duration-200 whitespace-nowrap shrink-0 shadow-sm"
          >
            <Icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>
  </div>
);
