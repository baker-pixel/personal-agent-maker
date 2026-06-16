// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reportClientHang, reportClientOk } from "@/integrations/supabase/clientHealth";

export type EmailCategory = "urgent" | "needs_reply" | "fyi" | "newsletter";

export interface TriagedEmail {
  id: string;
  nylas_message_id: string;
  nylas_thread_id: string | null;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  is_unread: boolean;
  category: EmailCategory;
  priority_score: number | null;
  ai_summary: string | null;
  ai_reason: string | null;
  processed_at: string | null;
  replied_at: string | null;
  snoozed_until: string | null;
}

export interface ByCategory {
  urgent: TriagedEmail[];
  needs_reply: TriagedEmail[];
  fyi: TriagedEmail[];
  newsletter: TriagedEmail[];
}

function getArchivedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem("normy_archived_emails") || "[]")); } catch { return new Set(); }
}
function addArchivedId(nylasMessageId: string) {
  try {
    const ids = getArchivedIds();
    ids.add(nylasMessageId);
    localStorage.setItem("normy_archived_emails", JSON.stringify(Array.from(ids).slice(-500)));
  } catch {}
}

const FETCH_TIMEOUT_MS = 10_000;

export function useTriagedEmails() {
  const [emails, setEmails] = useState<TriagedEmail[]>([]);
  const [snoozedEmails, setSnoozedEmails] = useState<TriagedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const userEmailsRef = useRef<Set<string>>(new Set());
  // True when the last fetch attempt failed. Consumers MUST treat an empty
  // list with loadFailed=true as "unknown", not "inbox empty" — on PWA resume
  // the first fetch often fires before the radio is awake and fails, and
  // mistaking that for an empty inbox used to auto-trigger a full re-triage.
  const [loadFailed, setLoadFailed] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const snoozeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hasLoadedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEmails = useCallback(async () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    // Background refetches (visibility/online/realtime catch-up) stay silent so
    // an already-rendered list doesn't flip back to the loading skeleton.
    if (!hasLoadedRef.current) setLoading(true);
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    try {
      // Fetch user's connected email addresses to filter out sent mail.
      // Only refresh when the set is empty (first load); grant emails rarely change.
      if (userEmailsRef.current.size === 0) {
        const { data: grants } = await supabase.from("nylas_grants").select("email").eq("status", "valid");
        for (const g of grants ?? []) {
          if (g.email) userEmailsRef.current.add(g.email.toLowerCase());
        }
      }

      // Race against a timeout: on PWA resume, a stale auth/socket can leave
      // supabase-js queries hanging forever, which kept the spinner up forever.
      const [activeRes, snoozedRes] = await Promise.race([
        Promise.all([
          supabase
            .from("email_metadata")
            .select("*")
            .gte("received_at", cutoff)
            // exclude emails snoozed into the future
            .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
            .order("received_at", { ascending: false })
            .limit(200),
          supabase
            .from("email_metadata")
            .select("*")
            .gte("received_at", cutoff)
            .gt("snoozed_until", now)
            .order("snoozed_until", { ascending: true }),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("email fetch timed out")), FETCH_TIMEOUT_MS)
        ),
      ]);

      // A PostgREST-level error must count as a failure too — previously it
      // was skipped silently and the empty list read as "inbox empty".
      if (activeRes.error) throw activeRes.error;

      const archivedIds = getArchivedIds();
      const isOwnEmail = (e: TriagedEmail) =>
        userEmailsRef.current.size > 0 && userEmailsRef.current.has(e.from_address?.toLowerCase());
      if (activeRes.data) {
        setEmails((activeRes.data as TriagedEmail[]).filter(e => !archivedIds.has(e.nylas_message_id) && !isOwnEmail(e)));
        hasLoadedRef.current = true;
      }
      if (!snoozedRes.error && snoozedRes.data) {
        setSnoozedEmails((snoozedRes.data as TriagedEmail[]).filter(e => !isOwnEmail(e)));
      }
      setLoadFailed(false);
      retryCountRef.current = 0;
      reportClientOk();
    } catch (err) {
      console.warn("fetchEmails failed or timed out:", err);
      setLoadFailed(true);
      // Only the race timeout counts as a hang — a PostgREST error reached the
      // server and back, which proves the client isn't poisoned.
      if (err instanceof Error && err.message === "email fetch timed out") reportClientHang();
      // Auto-retry with backoff: a resume-time failure is usually just the
      // network waking up — without this one failure stuck the UI on an empty
      // list until the app was killed and reopened.
      if (retryCountRef.current < 3) {
        const delay = 2_000 * 2 ** retryCountRef.current;
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          if (document.visibilityState === "visible") fetchEmails();
        }, delay);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Schedule a wake-up when a snoozed email is due
  const scheduleWakeUp = useCallback((id: string, until: Date) => {
    clearTimeout(snoozeTimers.current[id]);
    const msUntil = until.getTime() - Date.now();
    if (msUntil <= 0) return;
    snoozeTimers.current[id] = setTimeout(() => {
      fetchEmails();
      delete snoozeTimers.current[id];
    }, Math.min(msUntil, 2_147_483_647)); // cap at max safe timeout
  }, [fetchEmails]);

  useEffect(() => {
    fetchEmails();

    const subscribeChannel = () => {
      const channelName = `email_metadata_${Math.random().toString(36).slice(2)}`;
      channelRef.current = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "email_metadata" }, handleRealtimeEvent)
        .subscribe();
    };

    // Refetch when the PWA comes back to the foreground or regains network —
    // the realtime channel may have silently died while backgrounded, so
    // resubscribe it too or updates stay frozen until remount.
    const resync = () => {
      fetchEmails();
      if (channelRef.current && channelRef.current.state !== "joined") {
        supabase.removeChannel(channelRef.current);
        subscribeChannel();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", resync);

    const handleRealtimeEvent = (payload: any) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as TriagedEmail;
          if (getArchivedIds().has(row.nylas_message_id)) return;
          if (userEmailsRef.current.size > 0 && userEmailsRef.current.has(row.from_address?.toLowerCase())) return;
          if (row.snoozed_until && new Date(row.snoozed_until) > new Date()) {
            setSnoozedEmails(prev => prev.some(e => e.id === row.id) ? prev : [row, ...prev]);
          } else {
            setEmails(prev => prev.some(e => e.id === row.id) ? prev : [row, ...prev]);
          }
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as TriagedEmail;
          const isSnoozed = row.snoozed_until && new Date(row.snoozed_until) > new Date();
          if (isSnoozed) {
            setEmails(prev => prev.filter(e => e.id !== row.id));
            setSnoozedEmails(prev => prev.some(e => e.id === row.id) ? prev.map(e => e.id === row.id ? row : e) : [row, ...prev]);
          } else {
            setSnoozedEmails(prev => prev.filter(e => e.id !== row.id));
            setEmails(prev => prev.some(e => e.id === row.id) ? prev.map(e => e.id === row.id ? row : e) : [row, ...prev]);
          }
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as TriagedEmail).id;
          setEmails(prev => prev.filter(e => e.id !== id));
          setSnoozedEmails(prev => prev.filter(e => e.id !== id));
        }
    };

    subscribeChannel();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", resync);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      Object.values(snoozeTimers.current).forEach(clearTimeout);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [fetchEmails]);

  // ── Category override ────────────────────────────────────────────────────────

  const updateEmailCategory = useCallback(async (id: string, newCategory: EmailCategory) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, category: newCategory } : e));
    const { error } = await supabase.from("email_metadata").update({ category: newCategory }).eq("id", id);
    if (error) fetchEmails();
  }, [fetchEmails]);

  // ── Mark as read ─────────────────────────────────────────────────────────────

  const markEmailRead = useCallback(async (id: string, nylasMessageId: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, is_unread: false } : e));
    supabase.functions.invoke("email-actions", { body: { action: "mark_read", nylas_message_id: nylasMessageId } });
  }, []);

  // ── Archive primitives ────────────────────────────────────────────────────────

  const removeEmailOptimistic = useCallback((id: string) => {
    setEmails(prev => prev.filter(e => e.id !== id));
  }, []);

  const restoreEmailOptimistic = useCallback((email: TriagedEmail) => {
    setEmails(prev => {
      if (prev.some(e => e.id === email.id)) return prev;
      return [email, ...prev].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    });
  }, []);

  const confirmArchive = useCallback(async (id: string, nylasMessageId: string) => {
    addArchivedId(nylasMessageId);
    await supabase.from("email_metadata").delete().eq("id", id);
  }, []);

  // ── Snooze ────────────────────────────────────────────────────────────────────

  const snoozeEmail = useCallback(async (email: TriagedEmail, until: Date) => {
    // Optimistic: move out of main list into snoozed list
    setEmails(prev => prev.filter(e => e.id !== email.id));
    const snoozed = { ...email, snoozed_until: until.toISOString() };
    setSnoozedEmails(prev => {
      const filtered = prev.filter(e => e.id !== email.id);
      return [...filtered, snoozed].sort((a, b) => new Date(a.snoozed_until!).getTime() - new Date(b.snoozed_until!).getTime());
    });
    // Persist to DB
    await supabase.from("email_metadata").update({ snoozed_until: until.toISOString() }).eq("id", email.id);
    // Schedule auto-wake
    scheduleWakeUp(email.id, until);
  }, [scheduleWakeUp]);

  const unsnoozeEmail = useCallback(async (email: TriagedEmail) => {
    // Optimistic: restore to main list
    setSnoozedEmails(prev => prev.filter(e => e.id !== email.id));
    const restored = { ...email, snoozed_until: null };
    setEmails(prev => {
      if (prev.some(e => e.id === email.id)) return prev;
      return [restored, ...prev].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    });
    clearTimeout(snoozeTimers.current[email.id]);
    await supabase.from("email_metadata").update({ snoozed_until: null }).eq("id", email.id);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const byCategory: ByCategory = {
    urgent: emails.filter(e => e.category === "urgent").sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    needs_reply: emails.filter(e => e.category === "needs_reply").sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    fyi: emails.filter(e => e.category === "fyi"),
    newsletter: emails.filter(e => e.category === "newsletter"),
  };

  return {
    emails,
    snoozedEmails,
    byCategory,
    loading,
    loadFailed,
    refetch: fetchEmails,
    updateEmailCategory,
    markEmailRead,
    removeEmailOptimistic,
    restoreEmailOptimistic,
    confirmArchive,
    snoozeEmail,
    unsnoozeEmail,
  };
}