import type { QuickAction } from "../OrchestratorChat";

interface QuickActionPillsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionPills = ({ actions, onAction }: QuickActionPillsProps) => (
  <div className="flex gap-1.5 overflow-x-auto px-2 md:px-4 py-1.5 scrollbar-none">
    {actions.map((action) => {
      const Icon = action.icon;
      return (
        <button
          key={action.label}
          onClick={() => onAction(action)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border/40 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
        >
          <Icon className="w-3 h-3" />
          {action.label}
        </button>
      );
    })}
  </div>
);
