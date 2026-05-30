import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ListTodo, ArrowRight, Sparkles, Check, Loader2, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday, parseISO } from "date-fns";

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
}

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 } as const;

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-orange-400",
  low: "bg-muted-foreground/40",
};

export default function TasksWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TaskRow[]>([]);
  const [suggestedCount, setSuggestedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    const [openRes, suggestedRes] = await Promise.all([
      supabase
        .from("action_items")
        .select("id, title, due_date, priority, status")
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20),
      supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "suggested"),
    ]);
    if (openRes.data) setItems(openRes.data as TaskRow[]);
    setSuggestedCount(suggestedRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channelName = `tasks_widget_${Math.random().toString(36).slice(2)}`;
    channelRef.current = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_items" }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchData]);

  const completeTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCompleting(id);
    await supabase.from("action_items").update({ status: "done" }).eq("id", id);
    setItems(prev => prev.filter(t => t.id !== id));
    setCompleting(null);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-28" />
        <div className="h-8 bg-muted rounded w-10" />
        {[0, 1, 2].map(i => <div key={i} className="h-10 bg-muted rounded-xl" />)}
      </div>
    );
  }

  const overdue = items.filter(
    i => i.due_date && isPast(parseISO(i.due_date)) && !isToday(parseISO(i.due_date))
  );
  const dueToday = items.filter(i => i.due_date && isToday(parseISO(i.due_date)));

  const sortByPriority = (a: TaskRow, b: TaskRow) =>
    (PRIORITY_WEIGHT[a.priority as keyof typeof PRIORITY_WEIGHT] ?? 1) -
    (PRIORITY_WEIGHT[b.priority as keyof typeof PRIORITY_WEIGHT] ?? 1);

  const focus = [
    ...overdue.sort(sortByPriority),
    ...dueToday.sort(sortByPriority),
  ].slice(0, 5);

  const hasContent = focus.length > 0 || suggestedCount > 0;

  return (
    <div className="glass-card rounded-2xl p-5">
      {/* Header */}
      <button onClick={() => navigate("/tasks")} className="w-full text-left group mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <ListTodo className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="font-display text-sm font-semibold text-foreground truncate">Today's Tasks</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {overdue.length > 0 && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-destructive/10 text-destructive whitespace-nowrap">
                {overdue.length} overdue
              </span>
            )}
            {suggestedCount > 0 && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent flex items-center gap-1 whitespace-nowrap">
                <Sparkles className="w-2.5 h-2.5" />{suggestedCount}
              </span>
            )}
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </button>

      {!hasContent ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            All clear
          </div>
          <p className="text-xs text-muted-foreground/70">No tasks due today.</p>
        </div>
      ) : focus.length > 0 ? (
        <ul className="space-y-1.5">
          {focus.map(item => {
            const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date));
            const isDone = completing === item.id;
            const dotColor = PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.low;
            return (
              <li key={item.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${isOverdue ? "bg-destructive/5 border-destructive/15" : "bg-muted/30 border-transparent hover:border-border/50"}`}>
                <button
                  onClick={e => completeTask(e, item.id)}
                  disabled={isDone}
                  className="shrink-0 w-5 h-5 rounded-full border-2 border-border/60 flex items-center justify-center hover:border-accent hover:bg-accent/5 transition-all"
                  title="Mark complete"
                >
                  {isDone ? (
                    <Loader2 className="w-3 h-3 animate-spin text-accent" />
                  ) : (
                    <Check className="w-3 h-3 text-transparent hover:text-accent transition-colors" />
                  )}
                </button>
                <button onClick={() => navigate("/tasks")} className="flex-1 flex items-center gap-2 text-left min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className="flex-1 truncate text-sm text-foreground">{item.title}</span>
                  {item.due_date && (
                    <span className={`flex items-center gap-1 text-[11px] shrink-0 font-medium ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                      <Clock className="w-3 h-3" />
                      {format(parseISO(item.due_date), "MMM d")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-accent/5 border border-accent/15">
          <Sparkles className="w-4 h-4 text-accent shrink-0" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">{suggestedCount} task{suggestedCount === 1 ? "" : "s"}</span> suggested from your inbox
          </p>
        </div>
      )}
    </div>
  );
}
