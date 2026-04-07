const items = [
  { color: "bg-priority-urgent", label: "Urgent" },
  { color: "bg-priority-important", label: "Important" },
  { color: "bg-priority-low", label: "Low Priority" },
  { color: "bg-priority-noise", label: "Noise" },
];

export function PriorityLegend() {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2">
      <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-card/60 border border-border/30 backdrop-blur-sm">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${item.color}`} />
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
            {i < items.length - 1 && <div className="w-px h-3 bg-border/50 ml-2" />}
          </div>
        ))}
      </div>
    </div>
  );
}
