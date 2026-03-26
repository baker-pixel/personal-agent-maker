import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  CheckCircle2,
  Circle,
  Plus,
  Calendar,
  User,
  Flag,
  Loader2,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  ListTodo,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday, parseISO } from "date-fns";

interface ActionItem {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  source: string | null;
  meeting_summary: string | null;
  meeting_date: string | null;
  created_at: string;
  updated_at: string;
}

const priorityConfig = {
  high: { color: "text-destructive", bg: "bg-destructive/10", label: "High" },
  medium: { color: "text-accent", bg: "bg-accent/10", label: "Medium" },
  low: { color: "text-muted-foreground", bg: "bg-muted", label: "Low" },
} as const;

export const ActionItems = () => {
  const { agentName } = useAgent();
  const { toast } = useToast();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [newItem, setNewItem] = useState({ title: "", assignee: "", due_date: "", priority: "medium", description: "" });

  const fetchItems = useCallback(async () => {
    const query = supabase
      .from("action_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter === "open") query.eq("status", "open");
    else if (filter === "done") query.eq("status", "done");

    const { data, error } = await query;
    if (!error && data) setItems(data as unknown as ActionItem[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const toggleStatus = async (item: ActionItem) => {
    const newStatus = item.status === "open" ? "done" : "open";
    await supabase
      .from("action_items")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
  };

  const addItem = async () => {
    if (!newItem.title.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("action_items")
      .insert({
        user_id: session.user.id,
        title: newItem.title.trim(),
        description: newItem.description || null,
        assignee: newItem.assignee || null,
        due_date: newItem.due_date || null,
        priority: newItem.priority,
      } as any)
      .select()
      .single();

    if (!error && data) {
      setItems((prev) => [data as unknown as ActionItem, ...prev]);
      setNewItem({ title: "", assignee: "", due_date: "", priority: "medium", description: "" });
      setShowAdd(false);
      toast({ title: "Action item added" });
    }
  };

  const deleteItem = async (id: string) => {
    await supabase.from("action_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const openCount = items.filter((i) => i.status === "open").length;
  const overdueCount = items.filter(
    (i) => i.status === "open" && i.due_date && isPast(parseISO(i.due_date)) && !isToday(parseISO(i.due_date))
  ).length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <ListTodo className="w-8 h-8 text-accent" />
            Action Items
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {openCount} open{overdueCount > 0 && <span className="text-destructive"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="glass-card rounded-2xl p-5 mb-6 space-y-3" style={{ animation: "fade-up 0.2s ease-out both" }}>
          <input
            value={newItem.title}
            onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
            placeholder="What needs to be done?"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-b border-border/50 pb-2"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <textarea
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            placeholder="Notes or context (optional)"
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none h-16"
          />
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={newItem.assignee}
                onChange={(e) => setNewItem({ ...newItem, assignee: e.target.value })}
                placeholder="Assignee"
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none w-28"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={newItem.due_date}
                onChange={(e) => setNewItem({ ...newItem, due_date: e.target.value })}
                className="bg-transparent text-xs text-foreground focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={newItem.priority}
                onChange={(e) => setNewItem({ ...newItem, priority: e.target.value })}
                className="bg-transparent text-xs text-foreground focus:outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={addItem} disabled={!newItem.title.trim()} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground disabled:opacity-40">
              Add Item
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {f === "open" ? "Open" : f === "done" ? "Completed" : "All"}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading action items…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <ListTodo className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            {filter === "open" ? "No open action items — all clear!" : filter === "done" ? "No completed items yet" : "No action items"}
          </p>
        </div>
      ) : (
        <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.1s both" }}>
          {items.map((item) => {
            const prio = priorityConfig[item.priority as keyof typeof priorityConfig] || priorityConfig.medium;
            const isOverdue = item.status === "open" && item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date));

            return (
              <div key={item.id} className={`glass-card rounded-xl p-4 transition-all ${item.status === "done" ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleStatus(item)} className="mt-0.5 shrink-0">
                    {item.status === "done" ? (
                      <CheckCircle2 className="w-5 h-5 text-accent" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-accent transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${prio.bg} ${prio.color}`}>
                        {prio.label}
                      </span>
                      {item.assignee && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" /> {item.assignee}
                        </span>
                      )}
                      {item.due_date && (
                        <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          <Calendar className="w-3 h-3" />
                          {format(parseISO(item.due_date), "MMM d")}
                          {isOverdue && " (overdue)"}
                        </span>
                      )}
                      {item.meeting_summary && (
                        <span className="text-[10px] text-accent flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> From meeting
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
