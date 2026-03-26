import type { QuickAction } from "../OrchestratorChat";

interface QuickActionPillsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionPills = ({ actions, onAction }: QuickActionPillsProps) => (
  <div className="flex gap-2 overflow-x-auto px-2 md:px-4 py-2 scrollbar-none">
    {actions.map((action) => {
      const Icon = action.icon;
      return (
        <button
          key={action.label}
          onClick={() => onAction(action)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/20 hover:shadow-sm transition-all duration-200 whitespace-nowrap shrink-0"
        >
          <Icon className="w-3.5 h-3.5" />
          {action.label}
        </button>
      );
    })}
  </div>
);
