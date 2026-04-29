import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { ActionItems } from "@/components/ActionItems";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Tasks() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [suggestionRefresh, setSuggestionRefresh] = useState(0);

  const scanInboxForTasks = async () => {
    setScanning(true);
    const { data, error } = await supabase.functions.invoke("task-extract", { body: {} });
    if (error || data?.error) {
      toast({
        title: "Scan failed",
        description: data?.error || error?.message || "Couldn't scan inbox",
        variant: "destructive",
      });
    } else {
      const count = data?.suggested ?? 0;
      toast({
        title: count > 0 ? `${count} task${count === 1 ? "" : "s"} suggested` : "No new tasks found",
        description: count > 0 ? "Review them below before they're added to your list." : "Your inbox looks clear.",
      });
      setSuggestionRefresh((n) => n + 1);
    }
    setScanning(false);
  };

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)]">
      <div className="container max-w-3xl py-8 px-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        <div className="flex items-center justify-end mb-4">
          <button
            onClick={scanInboxForTasks}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/15 transition-colors disabled:opacity-40"
            title="Have Normy scan your recent emails for implicit tasks"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {scanning ? "Scanning…" : "Scan inbox for tasks"}
          </button>
        </div>

        <SuggestedTasks key={suggestionRefresh} />
        <ActionItems />
      </div>
    </div>
  );
}

// ---------------- Suggested tasks (AI-extracted, awaiting approval) ----------------
import { useEffect } from "react";
import { Check, X, Mail } from "lucide-react";

interface SuggestedItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  source: string | null;
  meeting_summary: string | null;
}

function SuggestedTasks() {
  const { toast } = useToast();
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("action_items")
      .select("id, title, description, due_date, priority, source, meeting_summary")
      .eq("status", "suggested")
      .order("created_at", { ascending: false });
    setItems((data as SuggestedItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const accept = async (id: string) => {
    await supabase.from("action_items").update({ status: "open" } as any).eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Added to your list" });
  };

  const dismiss = async (id: string) => {
    await supabase.from("action_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="mb-8" style={{ animation: "fade-up 0.3s ease-out both" }}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="font-display text-lg text-foreground">Suggested by Normy</h2>
        <span className="text-xs text-muted-foreground">· {items.length} awaiting review</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="glass-card rounded-xl p-4 border-accent/20">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                )}
                {item.meeting_summary && (
                  <p className="text-[11px] text-accent/80 mt-1.5 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> From: {item.meeting_summary}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {item.priority}
                  </span>
                  {item.due_date && (
                    <span className="text-[10px] text-muted-foreground">due {item.due_date}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => accept(item.id)}
                  className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                  title="Accept"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => dismiss(item.id)}
                  className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
