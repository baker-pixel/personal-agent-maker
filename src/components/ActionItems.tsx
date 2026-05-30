import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  CheckCircle2, Circle, Plus, Calendar, User, Flag,
  Loader2, Sparkles, X, ListTodo, Send, AlertTriangle,
  Pencil, Check, Clock, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { format, isPast, isToday, parseISO, isTomorrow, isThisWeek, differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "text-destructive",      bg: "bg-destructive/10",  border: "border-l-destructive",    dot: "bg-destructive"      },
  medium: { label: "Medium", color: "text-orange-500",       bg: "bg-orange-500/10",   border: "border-l-orange-400",     dot: "bg-orange-400"       },
  low:    { label: "Low",    color: "text-muted-foreground", bg: "bg-muted",           border: "border-l-muted-foreground/30", dot: "bg-muted-foreground/40" },
} as const;

const PRIORITY_SORT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const GROUP_ORDER = ["Overdue", "Today", "Tomorrow", "This week", "Upcoming", "No due date"];

type FilterType = "open" | "done" | "all";
type PriorityFilter = "all" | "high" | "medium" | "low";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dueDateLabel(dateStr: string): { label: string; urgent: boolean; today: boolean } {
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    if (isToday(d)) return { label: "Today", urgent: false, today: true };
    if (isPast(d)) {
      const days = differenceInDays(now, d);
      return { label: days === 1 ? "Yesterday" : `${days}d overdue`, urgent: true, today: false };
    }
    if (isTomorrow(d)) return { label: "Tomorrow", urgent: false, today: false };
    if (isThisWeek(d)) return { label: format(d, "EEEE"), urgent: false, today: false };
    return { label: format(d, "MMM d"), urgent: false, today: false };
  } catch {
    return { label: dateStr, urgent: false, today: false };
  }
}

function getGroup(item: ActionItem): string {
  if (!item.due_date) return "No due date";
  const d = parseISO(item.due_date);
  if (isPast(d) && !isToday(d)) return "Overdue";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isThisWeek(d)) return "This week";
  return "Upcoming";
}

function sortItems(items: ActionItem[]): ActionItem[] {
  const score = (item: ActionItem) => {
    const p = PRIORITY_SORT[item.priority] ?? 1;
    if (!item.due_date) return 1000 + p;
    const d = parseISO(item.due_date);
    if (isPast(d) && !isToday(d)) return p;
    if (isToday(d)) return 10 + p;
    if (isTomorrow(d)) return 20 + p;
    if (isThisWeek(d)) return 30 + p;
    return 100 + p;
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ActionItems = () => {
  const { agentName } = useAgent();
  const { toast } = useToast();

  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("open");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", assignee: "", due_date: "", priority: "medium", description: "" });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ActionItem>>({});
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const addTitleRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    let query = supabase
      .from("action_items")
      .select("*")
      .neq("status", "suggested");

    if (filter === "open") query = query.eq("status", "open");
    else if (filter === "done") query = query.eq("status", "done");

    const { data, error } = await query;
    if (!error && data) setItems(sortItems(data as unknown as ActionItem[]));
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchItems();
    const name = `action_items_${Math.random().toString(36).slice(2)}`;
    channelRef.current = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_items" }, fetchItems)
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchItems]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const toggleStatus = async (item: ActionItem) => {
    const newStatus = item.status === "open" ? "done" : "open";
    setItems(prev => sortItems(prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i)));
    await supabase.from("action_items").update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq("id", item.id);
  };

  const addItem = async () => {
    if (!newItem.title.trim()) return;
    setAdding(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAdding(false); return; }
    const { data, error } = await supabase
      .from("action_items")
      .insert({ user_id: session.user.id, title: newItem.title.trim(), description: newItem.description || null, assignee: newItem.assignee || null, due_date: newItem.due_date || null, priority: newItem.priority } as any)
      .select().single();
    if (!error && data) {
      setItems(prev => sortItems([data as unknown as ActionItem, ...prev]));
      setNewItem({ title: "", assignee: "", due_date: "", priority: "medium", description: "" });
      setShowAdd(false);
      toast({ title: "Task added" });
    }
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    const updates = { ...editDraft, updated_at: new Date().toISOString() };
    setItems(prev => sortItems(prev.map(i => i.id === id ? { ...i, ...updates } : i)));
    setEditingId(null);
    await supabase.from("action_items").update(updates as any).eq("id", id);
  };

  const deleteItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    const timer = setTimeout(async () => {
      await supabase.from("action_items").delete().eq("id", id);
    }, 4000);
    toast({
      title: "Task deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => {
          clearTimeout(timer);
          if (item) setItems(prev => sortItems([item, ...prev]));
        }}>
          Undo
        </ToastAction>
      ),
      duration: 4000,
    });
  };

  const nudgeAssignee = async (item: ActionItem) => {
    if (!item.assignee?.includes("@")) {
      toast({ title: "Set assignee to an email address first", variant: "destructive" });
      return;
    }
    setNudgingId(item.id);
    const { data, error } = await supabase.functions.invoke("draft-followup", {
      body: { type: "action_nudge", contactEmail: item.assignee, actionItemTitle: item.title, actionItemAssignee: item.assignee },
    });
    toast(error || data?.error
      ? { title: "Failed to draft nudge", variant: "destructive" }
      : { title: "Nudge drafted", description: "Review it in your Approval Inbox" }
    );
    setNudgingId(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = items.filter(item => {
    if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
    if (search.trim().length > 1) {
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q) || item.assignee?.toLowerCase().includes(q);
    }
    return true;
  });

  const openItems = items.filter(i => i.status === "open");
  const overdueCount = openItems.filter(i => i.due_date && isPast(parseISO(i.due_date)) && !isToday(parseISO(i.due_date))).length;
  const dueTodayCount = openItems.filter(i => i.due_date && isToday(parseISO(i.due_date))).length;

  const showGrouped = filter === "open" && !search.trim();
  const grouped = showGrouped
    ? filtered.reduce<Record<string, ActionItem[]>>((acc, item) => {
        const g = getGroup(item);
        if (!acc[g]) acc[g] = [];
        acc[g].push(item);
        return acc;
      }, {})
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-2xl text-foreground flex items-center gap-2.5">
            <ListTodo className="w-6 h-6 text-accent" />
            Tasks
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {openItems.length} open
            {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} overdue</span>}
            {dueTodayCount > 0 && <span className="text-accent"> · {dueTodayCount} due today</span>}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setTimeout(() => addTitleRef.current?.focus(), 50); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="glass-card rounded-2xl p-5 mb-5 space-y-3" style={{ animation: "fade-up 0.2s ease-out both" }}>
          <input
            ref={addTitleRef}
            value={newItem.title}
            onChange={e => setNewItem({ ...newItem, title: e.target.value })}
            placeholder="What needs to be done?"
            className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none border-b border-border/50 pb-2"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) addItem(); if (e.key === "Escape") setShowAdd(false); }}
          />
          <textarea
            value={newItem.description}
            onChange={e => setNewItem({ ...newItem, description: e.target.value })}
            placeholder="Notes or context (optional)"
            rows={2}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none"
          />
          <div className="flex flex-wrap gap-4 pt-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input value={newItem.assignee} onChange={e => setNewItem({ ...newItem, assignee: e.target.value })} placeholder="Assignee email" className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none w-36" />
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input type="date" value={newItem.due_date} onChange={e => setNewItem({ ...newItem, due_date: e.target.value })} className="bg-transparent text-xs text-foreground focus:outline-none" />
            </div>
            <div className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={newItem.priority} onChange={e => setNewItem({ ...newItem, priority: e.target.value })} className="bg-transparent text-xs text-foreground focus:outline-none">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50">Cancel</button>
            <button onClick={addItem} disabled={!newItem.title.trim() || adding} className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-accent text-accent-foreground disabled:opacity-40 flex items-center gap-1.5">
              {adding && <Loader2 className="w-3 h-3 animate-spin" />}
              Add task
            </button>
          </div>
        </div>
      )}

      {/* Controls: filter + priority + search */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" style={{ animation: "fade-up 0.2s ease-out 0.05s both" }}>
        {/* Status filter */}
        <div className="flex gap-1 bg-muted/40 rounded-lg p-0.5">
          {(["open", "done", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {f === "open" ? "Open" : f === "done" ? "Done" : "All"}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex gap-1">
          {(["all", "high", "medium", "low"] as const).map(p => (
            <button key={p} onClick={() => setPriorityFilter(p)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              priorityFilter === p
                ? p === "high" ? "bg-destructive/10 text-destructive" : p === "medium" ? "bg-orange-500/10 text-orange-500" : p === "low" ? "bg-muted text-muted-foreground" : "bg-accent/10 text-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}>
              {p === "all" ? "All priority" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-muted/30 border border-border/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-muted-foreground/50"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="glass-card rounded-xl px-4 py-3.5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
            {overdueCount > 0 && filter === "open"
              ? <AlertTriangle className="w-7 h-7 text-destructive/40" />
              : <ListTodo className="w-7 h-7 text-muted-foreground/30" />}
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            {search.trim() ? "No matching tasks" : filter === "open" ? "All clear" : filter === "done" ? "No completed tasks" : "No tasks yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {search.trim() ? "Try a different search term" : filter === "open" ? "Nothing pending — great job." : "Complete tasks will appear here."}
          </p>
        </div>
      ) : grouped ? (
        <div className="space-y-5" style={{ animation: "fade-up 0.2s ease-out 0.1s both" }}>
          {GROUP_ORDER.filter(g => grouped[g]?.length).map(group => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {group === "Overdue" && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                {group === "Today" && <Clock className="w-3.5 h-3.5 text-accent" />}
                <span className={`text-[11px] font-bold uppercase tracking-wider ${group === "Overdue" ? "text-destructive" : group === "Today" ? "text-accent" : "text-muted-foreground/50"}`}>
                  {group}
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-medium">{grouped[group].length}</span>
                <div className="flex-1 h-px bg-border/40 ml-1" />
              </div>
              <div className="space-y-1.5">
                {grouped[group].map(item => (
                  <TaskCard key={item.id} item={item} editingId={editingId} editDraft={editDraft} nudgingId={nudgingId}
                    onToggle={toggleStatus} onDelete={deleteItem} onNudge={nudgeAssignee}
                    onStartEdit={id => { setEditingId(id); setEditDraft(item); }}
                    onEditChange={d => setEditDraft(d)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => setEditingId(null)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5" style={{ animation: "fade-up 0.2s ease-out 0.1s both" }}>
          {filtered.map(item => (
            <TaskCard key={item.id} item={item} editingId={editingId} editDraft={editDraft} nudgingId={nudgingId}
              onToggle={toggleStatus} onDelete={deleteItem} onNudge={nudgeAssignee}
              onStartEdit={id => { setEditingId(id); setEditDraft(item); }}
              onEditChange={d => setEditDraft(d)}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  item: ActionItem;
  editingId: string | null;
  editDraft: Partial<ActionItem>;
  nudgingId: string | null;
  onToggle: (item: ActionItem) => void;
  onDelete: (id: string) => void;
  onNudge: (item: ActionItem) => void;
  onStartEdit: (id: string) => void;
  onEditChange: (draft: Partial<ActionItem>) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
}

function TaskCard({ item, editingId, editDraft, nudgingId, onToggle, onDelete, onNudge, onStartEdit, onEditChange, onSaveEdit, onCancelEdit }: TaskCardProps) {
  const isEditing = editingId === item.id;
  const prio = PRIORITY_CONFIG[item.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  const isOverdue = item.status === "open" && item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date));
  const isDone = item.status === "done";
  const due = item.due_date ? dueDateLabel(item.due_date) : null;

  if (isEditing) {
    return (
      <div className="glass-card rounded-xl border-l-4 border-l-accent p-4 space-y-3" style={{ animation: "fade-up 0.15s ease-out both" }}>
        <input
          value={editDraft.title ?? item.title}
          onChange={e => onEditChange({ ...editDraft, title: e.target.value })}
          className="w-full bg-transparent text-sm font-medium text-foreground border-b border-border/50 pb-1.5 focus:outline-none"
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") onSaveEdit(item.id); if (e.key === "Escape") onCancelEdit(); }}
        />
        <textarea
          value={editDraft.description ?? item.description ?? ""}
          onChange={e => onEditChange({ ...editDraft, description: e.target.value || null })}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none"
        />
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input type="date" value={editDraft.due_date ?? item.due_date ?? ""} onChange={e => onEditChange({ ...editDraft, due_date: e.target.value || null })} className="bg-transparent text-xs text-foreground focus:outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={editDraft.priority ?? item.priority} onChange={e => onEditChange({ ...editDraft, priority: e.target.value })} className="bg-transparent text-xs text-foreground focus:outline-none">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <input value={editDraft.assignee ?? item.assignee ?? ""} onChange={e => onEditChange({ ...editDraft, assignee: e.target.value || null })} placeholder="Assignee" className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none w-28" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">Cancel</button>
          <button onClick={() => onSaveEdit(item.id)} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
            <Check className="w-3 h-3" /> Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group glass-card rounded-xl border-l-4 transition-all ${
      isDone ? `opacity-55 ${prio.border}` :
      isOverdue ? "border-l-destructive bg-destructive/[0.02]" :
      prio.border
    }`}>
      <div className="flex items-start gap-3 p-3.5 pr-3">
        {/* Checkbox — large tap target */}
        <button
          onClick={() => onToggle(item)}
          className="mt-0.5 shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted/50 transition-colors active:scale-90"
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-accent" />
            : <Circle className={`w-5 h-5 transition-colors ${isOverdue ? "text-destructive/60 hover:text-destructive" : "text-muted-foreground/50 hover:text-accent"}`} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {item.title}
          </p>

          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Priority badge */}
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${prio.bg} ${prio.color}`}>
              {prio.label}
            </span>

            {/* Due date */}
            {due && (
              <span className={`text-[11px] flex items-center gap-1 font-medium ${due.urgent ? "text-destructive" : due.today ? "text-accent" : "text-muted-foreground"}`}>
                <Calendar className="w-3 h-3" />
                {due.label}
              </span>
            )}

            {/* Assignee */}
            {item.assignee && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" />
                {item.assignee.includes("@") ? item.assignee.split("@")[0] : item.assignee}
              </span>
            )}

            {/* Source tag */}
            {item.meeting_summary && (
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                from meeting
              </span>
            )}
          </div>
        </div>

        {/* Actions — always visible on mobile, hover reveals on desktop */}
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5 sm:opacity-40 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onStartEdit(item.id)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Edit task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {isOverdue && item.assignee?.includes("@") && (
            <button
              onClick={() => onNudge(item)}
              disabled={nudgingId === item.id}
              className="p-2 rounded-xl text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
              title="Send nudge email"
            >
              {nudgingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 rounded-xl text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete task"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
