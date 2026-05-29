import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListTodo, ArrowRight, AlertCircle, Sparkles, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday, parseISO } from "date-fns";

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
}

export default function TasksWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TaskRow[]>([]);
  const [suggestedCount, setSuggestedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  const fetchData = async () => {
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
    setItems((openRes.data as TaskRow[]) || []);
    setSuggestedCount(suggestedRes.count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const completeTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCompleting(id);
    await supabase.from("action_items").update({ status: "done" }).eq("id", id);
    setItems((prev) => prev.filter((t) => t.id !== id));
    setCompleting(null);
  };

  if (loading) return null;

  const overdue = items.filter(
    (i) => i.due_date && isPast(parseISO(i.due_date)) && !isToday(parseISO(i.due_date))
  );
  const dueToday = items.filter((i) => i.due_date && isToday(parseISO(i.due_date)));
  const focus = [...overdue, ...dueToday].slice(0, 4);
  const hasContent = focus.length > 0 || suggestedCount > 0;

  return (
    <div className="glass-card rounded-2xl p-5">
      <button
        onClick={() => navigate("/tasks")}
        className="w-full text-left group"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-accent" />
            <h3 className="font-display text-base text-foreground">Today's Tasks</h3>
            {overdue.length > 0 && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                {overdue.length} overdue
              </span>
            )}
            {suggestedCount > 0 && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/10 text-accent flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> {suggestedCount} suggested
              </span>
            )}
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
        </div>
      </button>

      {!hasContent ? (
        <p className="text-sm text-muted-foreground">All clear — no tasks due today.</p>
      ) : focus.length > 0 ? (
        <ul className="space-y-1">
          {focus.map((item) => {
            const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date));
            const isDone = completing === item.id;
            return (
              <li key={item.id} className="flex items-center gap-2 text-sm group/item">
                <button
                  onClick={(e) => completeTask(e, item.id)}
                  disabled={isDone}
                  className="shrink-0 w-4 h-4 rounded border border-border/60 flex items-center justify-center hover:border-accent hover:bg-accent/5 transition-all"
                  title="Mark complete"
                >
                  {isDone ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-accent" />
                  ) : (
                    <Check className="w-2.5 h-2.5 text-transparent group-hover/item:text-accent transition-colors" />
                  )}
                </button>
                <button
                  onClick={() => navigate("/tasks")}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  {isOverdue && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                  <span className="flex-1 truncate text-foreground">{item.title}</span>
                  {item.due_date && (
                    <span className={`text-[11px] shrink-0 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {format(parseISO(item.due_date), "MMM d")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {suggestedCount} task{suggestedCount === 1 ? "" : "s"} suggested from your inbox — review them.
        </p>
      )}
    </div>
  );
}
