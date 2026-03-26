import type { QuickAction } from "../OrchestratorChat";

interface QuickActionGridProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionGrid = ({ actions, onAction }: QuickActionGridProps) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 w-full max-w-2xl">
    {actions.map((action) => {
      const Icon = action.icon;
      return (
        <button
          key={action.label}
          onClick={() => onAction(action)}
          className="group flex flex-col items-start gap-2.5 p-3.5 rounded-xl bg-card border border-border/60 hover:border-primary/20 hover:bg-muted/50 transition-all duration-150 text-left"
        >
          <Icon className={`w-4.5 h-4.5 ${action.color} opacity-70 group-hover:opacity-100 transition-opacity`} />
          <span className="text-xs font-medium text-foreground leading-tight">{action.label}</span>
        </button>
      );
    })}
  </div>
);
