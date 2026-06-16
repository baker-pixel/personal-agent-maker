import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Status = "done" | "in_progress" | "blocked" | "not_started";

interface Item {
  id: string;
  category: string;
  label: string;
  status: Status;
  notes: string | null;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
}

const STATUS_META: Record<Status, { label: string; cls: string; dot: string }> = {
  done:        { label: "Done",        cls: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-800 border-amber-300",       dot: "bg-amber-500" },
  blocked:     { label: "Blocked",     cls: "bg-rose-100 text-rose-800 border-rose-300",          dot: "bg-rose-500" },
  not_started: { label: "Not started", cls: "bg-stone-100 text-stone-700 border-stone-300",       dot: "bg-stone-400" },
};
const STATUS_CYCLE: Status[] = ["not_started", "in_progress", "done", "blocked"];

const getName = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mvp_checklist_name") || "";
};

export default function MvpChecklist() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(getName());
  const [newCategory, setNewCategory] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("mvp_checklist_items")
        .select("*")
        .order("sort_order", { ascending: true });
      if (!mounted) return;
      if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      else setItems((data || []) as Item[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("mvp_checklist_items")
      .on("postgres_changes", { event: "*", schema: "public", table: "mvp_checklist_items" }, (payload) => {
        setItems((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Item;
            if (prev.find((p) => p.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as Item;
            return prev.map((p) => (p.id === row.id ? row : p));
          }
          if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            return prev.filter((p) => p.id !== row.id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      if (!m.has(it.category)) m.set(it.category, []);
      m.get(it.category)!.push(it);
    }
    return Array.from(m.entries());
  }, [items]);

  const stats = useMemo(() => {
    const total = items.length || 1;
    const done = items.filter((i) => i.status === "done").length;
    return { total: items.length, done, pct: Math.round((done / total) * 100) };
  }, [items]);

  const persistName = (v: string) => {
    setName(v);
    if (typeof window !== "undefined") localStorage.setItem("mvp_checklist_name", v);
  };

  const updateItem = async (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as Item : p)));
    const { error } = await supabase
      .from("mvp_checklist_items")
      .update({ ...patch, updated_by: name || "anonymous" })
      .eq("id", id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
  };

  const cycleStatus = (it: Item) => {
    const idx = STATUS_CYCLE.indexOf(it.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    updateItem(it.id, { status: next });
  };

  const addItem = async () => {
    const cat = newCategory.trim();
    const lbl = newLabel.trim();
    if (!cat || !lbl) return;
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { error } = await supabase.from("mvp_checklist_items").insert({
      category: cat,
      label: lbl,
      status: "not_started",
      sort_order: maxOrder + 10,
      updated_by: name || "anonymous",
    });
    if (error) toast({ title: "Add failed", description: error.message, variant: "destructive" });
    else {
      setNewLabel("");
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("mvp_checklist_items").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
  };

  return (
    <div className="min-h-screen bg-[hsl(35_40%_96%)] pt-[env(safe-area-inset-top)]">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-stone-900">
            Normy MVP Launch Checklist
          </h1>
          <p className="text-stone-600 mt-2">
            Shared & live — anyone with the link can edit. Updates sync in real time.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-700">Progress</span>
                <span className="text-sm text-stone-500">{stats.done} / {stats.total} done</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(14_80%_60%)] transition-all"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
            </div>
            <div className="sm:w-56">
              <label className="text-xs text-stone-500 block mb-1">Your name (optional)</label>
              <Input
                value={name}
                onChange={(e) => persistName(e.target.value)}
                placeholder="e.g. Alex"
                className="bg-white"
              />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([category, rows]) => (
              <section key={category}>
                <h2 className="font-serif text-2xl text-stone-900 mb-3">{category}</h2>
                <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                  {rows.map((it) => {
                    const meta = STATUS_META[it.status];
                    return (
                      <div key={it.id} className="p-4 flex flex-col sm:flex-row gap-3 sm:items-start">
                        <button
                          onClick={() => cycleStatus(it)}
                          className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${meta.cls} hover:opacity-80 transition`}
                          title="Click to cycle status"
                        >
                          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </button>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={it.label}
                            onChange={(e) => updateItem(it.id, { label: e.target.value })}
                            className="border-0 px-0 h-auto py-0 text-base font-medium text-stone-900 focus-visible:ring-0 shadow-none"
                          />
                          <Textarea
                            value={it.notes || ""}
                            onChange={(e) => updateItem(it.id, { notes: e.target.value })}
                            placeholder="Add notes…"
                            rows={1}
                            className="border-0 px-0 py-1 mt-1 text-sm text-stone-600 focus-visible:ring-0 shadow-none resize-none min-h-0"
                          />
                          {it.updated_by && (
                            <p className="text-[11px] text-stone-400 mt-1">
                              Last edited by {it.updated_by}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="shrink-0 text-stone-400 hover:text-rose-600 transition p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="bg-white rounded-xl border border-dashed border-stone-300 p-4">
              <h3 className="text-sm font-medium text-stone-700 mb-3">Add new item</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category (e.g. QA & Post-Launch)"
                  className="sm:max-w-xs"
                />
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="What needs to happen?"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                />
                <Button onClick={addItem} disabled={!newCategory.trim() || !newLabel.trim()}>
                  <Plus className="w-4 h-4" /> Add
                </Button>
              </div>
            </section>
          </div>
        )}

        <footer className="mt-12 text-center text-xs text-stone-400">
          <Check className="inline w-3 h-3 mr-1" /> Changes save automatically and sync to all viewers.
        </footer>
      </div>
    </div>
  );
}
