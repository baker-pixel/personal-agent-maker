import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { NotConnectedState } from "@/components/NotConnectedState";
import {
  ArrowLeft, Sparkles, Loader2, Check, X, Mail, Calendar,
  CheckCheck, AlertTriangle, RefreshCw,
} from "lucide-react";
import { ActionItems } from "@/components/ActionItems";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// ─── Page ─────────────────────────────────────────────────────────────────────

const SCAN_COOLDOWN_MS = 5 * 60 * 1000;

function lastScanKey(userId: string) {
  return `task_extract_last_run_${userId}`;
}

export default function Tasks() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isConnected, integrationsLoading } = useIntegrations();
  const gmailConnected = isConnected("gmail");
  const [scanning, setScanning] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [suggestionRefresh, setSuggestionRefresh] = useState(0);

  // silent=true suppresses the "no new tasks" toast (used for auto-scan on mount)
  const scanInboxForTasks = async (silent = false) => {
    setScanning(true);
    const { data, error } = await supabase.functions.invoke("task-extract", { body: {} });
    if (error || data?.error) {
      if (!silent) {
        toast({ title: "Scan failed", description: data?.error || error?.message || "Couldn't scan inbox", variant: "destructive" });
      }
    } else {
      const count = data?.suggested ?? 0;
      const now = new Date();
      setLastScannedAt(now);
      if (!silent || count > 0) {
        toast({
          title: count > 0 ? `${count} task${count === 1 ? "" : "s"} found` : "No new tasks found",
          description: count > 0 ? "Review the suggestions below." : "Your inbox is clear of action items.",
        });
      }
      setSuggestionRefresh(n => n + 1);
    }
    setScanning(false);
  };

  // Auto-scan on mount if never run or cooldown elapsed
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const key = lastScanKey(session.user.id);
      const lastRaw = localStorage.getItem(key);
      if (lastRaw) {
        const lastMs = parseInt(lastRaw, 10);
        setLastScannedAt(new Date(lastMs));
        if (Date.now() - lastMs < SCAN_COOLDOWN_MS) return;
      }
      localStorage.setItem(key, String(Date.now()));
      scanInboxForTasks(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      <div className="container max-w-3xl py-6 px-4 space-y-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        {/* Not-connected banner */}
        {!integrationsLoading && !gmailConnected && (
          <NotConnectedState integration="gmail" variant="inline" />
        )}

        {/* AI Scan card */}
        <div className="glass-card rounded-2xl p-4 flex items-center gap-4" style={{ animation: "fade-up 0.25s ease-out both" }}>
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">AI task extraction</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastScannedAt
                ? `Last scanned ${Math.floor((Date.now() - lastScannedAt.getTime()) / 60000)} min ago`
                : "Scan emails & calendar for hidden action items"}
            </p>
          </div>
          <button
            onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) localStorage.setItem(lastScanKey(session.user.id), String(Date.now()));
              scanInboxForTasks();
            }}
            disabled={scanning || !gmailConnected}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {scanning ? "Scanning…" : "Scan now"}
          </button>
        </div>

        <SuggestedTasks key={suggestionRefresh} onAccepted={() => setSuggestionRefresh(n => n + 1)} />
        <ActionItems />
      </div>
    </div>
  );
}

// ─── Suggested Tasks ──────────────────────────────────────────────────────────

interface SuggestedItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  source: string | null;
  meeting_summary: string | null;
}

const PRIORITY_SORT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<string, string> = { high: "bg-destructive", medium: "bg-orange-400", low: "bg-muted-foreground/40" };
const PRIORITY_LABEL: Record<string, { color: string; bg: string }> = {
  high:   { color: "text-destructive",  bg: "bg-destructive/10"  },
  medium: { color: "text-orange-500",   bg: "bg-orange-500/10"   },
  low:    { color: "text-muted-foreground", bg: "bg-muted"       },
};

function SuggestedTasks({ onAccepted }: { onAccepted?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("action_items")
      .select("id, title, description, due_date, priority, source, meeting_summary")
      .eq("status", "suggested")
      .order("created_at", { ascending: false });
    const sorted = ((data as SuggestedItem[]) || []).sort(
      (a, b) => (PRIORITY_SORT[a.priority] ?? 1) - (PRIORITY_SORT[b.priority] ?? 1)
    );
    setItems(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    channelRef.current = supabase
      .channel(`suggested_tasks_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_items" }, fetchItems)
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchItems]);

  const accept = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from("action_items").update({ status: "open" } as any).eq("id", id);
    onAccepted?.();
    toast({ title: "Task added to your list" });
  };

  const dismiss = async (id: string) => {
    const item = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    // Soft-delete preserves the signal for AI dedup — dismissed tasks won't be re-suggested
    await supabase.from("action_items").update({ status: "dismissed" } as any).eq("id", id);
    toast({
      title: "Suggestion dismissed",
      action: (
        <ToastAction altText="Undo" onClick={async () => {
          await supabase.from("action_items").update({ status: "suggested" } as any).eq("id", id);
          if (item) setItems(prev => [item, ...prev].sort((a, b) => (PRIORITY_SORT[a.priority] ?? 1) - (PRIORITY_SORT[b.priority] ?? 1)));
        }}>
          Undo
        </ToastAction>
      ),
      duration: 4000,
    });
  };

  const acceptAll = async () => {
    setAcceptingAll(true);
    const ids = items.map(i => i.id);
    setItems([]);
    await supabase.from("action_items").update({ status: "open" } as any).in("id", ids);
    onAccepted?.();
    toast({ title: `${ids.length} tasks added to your list` });
    setAcceptingAll(false);
  };

  const dismissAll = async () => {
    const backup = [...items];
    const ids = items.map(i => i.id);
    setItems([]);
    // Soft-delete all — preserves signals for AI dedup
    await supabase.from("action_items").update({ status: "dismissed" } as any).in("id", ids);
    toast({
      title: `${ids.length} suggestions dismissed`,
      action: (
        <ToastAction altText="Undo" onClick={async () => {
          await supabase.from("action_items").update({ status: "suggested" } as any).in("id", ids);
          setItems(backup);
        }}>
          Undo
        </ToastAction>
      ),
      duration: 5000,
    });
  };

  if (loading || items.length === 0) return null;

  const highCount = items.filter(i => i.priority === "high").length;

  return (
    <div style={{ animation: "fade-up 0.25s ease-out 0.1s both" }}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="font-display text-base font-semibold text-foreground">Suggested by AI</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">{items.length}</span>
          {highCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> {highCount} high
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={dismissAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50">
            Dismiss all
          </button>
          <button
            onClick={acceptAll}
            disabled={acceptingAll}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {acceptingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
            Accept all
          </button>
        </div>
      </div>

      {/* Suggested items */}
      <div className="space-y-1.5">
        {items.map(item => {
          const dot = PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.low;
          const label = PRIORITY_LABEL[item.priority] ?? PRIORITY_LABEL.low;
          const isEmail = item.source?.includes("email") || item.source === "email_triage" || item.source === "ai_email_extract";

          return (
            <div key={item.id} className="glass-card rounded-xl border border-accent/10 p-3.5">
              <div className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
                  {(item.description || item.meeting_summary) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 flex items-center gap-1">
                      {isEmail ? <Mail className="w-3 h-3 shrink-0" /> : <Calendar className="w-3 h-3 shrink-0" />}
                      {item.description || item.meeting_summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${label.bg} ${label.color}`}>
                      {item.priority}
                    </span>
                    {item.due_date && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" /> {item.due_date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => accept(item.id)}
                    className="p-2 rounded-xl text-accent hover:bg-accent/10 transition-colors"
                    title="Accept — add to task list"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
