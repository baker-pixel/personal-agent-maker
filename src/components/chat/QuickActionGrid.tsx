import type { QuickAction } from "../OrchestratorChat";

interface QuickActionGridProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

export const QuickActionGrid = ({ actions, onAction }: QuickActionGridProps) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
    {actions.map((action) => {
      const Icon = action.icon;
      return (
        <button
          key={action.label}
          onClick={() => onAction(action)}
          className="group flex flex-col items-start gap-3 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/20 hover:shadow-md transition-all duration-200 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Icon className={`w-4 h-4 ${action.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
          </div>
          <span className="text-xs font-medium text-foreground leading-tight">{action.label}</span>
        </button>
      );
    })}
  </div>
);
