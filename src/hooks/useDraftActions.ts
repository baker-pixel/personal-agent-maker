import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DraftAction {
  id: string;
  user_id: string;
  type: string;
  status: string;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body: string | null;
  thread_id: string | null;
  gmail_message_id: string | null;
  nylas_message_id: string | null;
  email_metadata_id: string | null;
  in_reply_to: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useDraftActions() {
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [sentDrafts, setSentDrafts] = useState<DraftAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSent, setLoadingSent] = useState(false);
  const channelName = useRef(`draft_actions_realtime_${Math.random().toString(36).slice(2)}`);

  const fetchDrafts = useCallback(async () => {
    const { data, error } = await supabase
      .from("draft_actions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDrafts(data as DraftAction[]);
    }
    setLoading(false);
  }, []);

  const fetchSentDrafts = useCallback(async () => {
    setLoadingSent(true);
    const { data, error } = await supabase
      .from("draft_actions")
      .select("*")
      .in("status", ["sent", "rejected", "failed"])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setSentDrafts(data as DraftAction[]);
    }
    setLoadingSent(false);
  }, []);

  // Real-time subscription: inbox badge + list update instantly when drafts change
  useEffect(() => {
    fetchDrafts();

    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_actions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newDraft = payload.new as DraftAction;
            if (newDraft.status === "pending") {
              setDrafts((prev) => {
                if (prev.some((d) => d.id === newDraft.id)) return prev;
                return [newDraft, ...prev];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as DraftAction;
            if (updated.status === "pending") {
              setDrafts((prev) =>
                prev.map((d) => (d.id === updated.id ? updated : d))
              );
            } else {
              // Moved out of pending (sent/rejected/failed) — remove from list
              setDrafts((prev) => prev.filter((d) => d.id !== updated.id));
            }
          } else if (payload.eventType === "DELETE") {
            setDrafts((prev) => prev.filter((d) => d.id !== (payload.old as DraftAction).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDrafts]);

  const approveDraft = useCallback(async (draftId: string): Promise<{ success: boolean; error?: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ draftId }),
      }
    );

    const result = await resp.json();

    if (resp.status === 409) {
      // Another request already claimed this draft — sync local state
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      return { success: false, error: "This draft was already sent or is being processed." };
    }

    if (!resp.ok) {
      // On failure the backend set status="failed" — realtime will remove from list,
      // but refetch to ensure UI is consistent if realtime is slow.
      fetchDrafts();
      return { success: false, error: result.error || "Failed to send" };
    }

    // Realtime will handle removing from list, but optimistic update feels faster
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    return { success: true };
  }, [fetchDrafts]);

  const rejectDraft = useCallback(async (draftId: string) => {
    await supabase
      .from("draft_actions")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", draftId);

    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  const saveDraft = useCallback(async (draft: {
    to_email: string;
    to_name?: string;
    subject: string;
    body: string;
    thread_id?: string;
    in_reply_to?: string;
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from("draft_actions")
      .insert({
        user_id: session.user.id,
        type: "email_reply",
        to_email: draft.to_email,
        to_name: draft.to_name ?? null,
        subject: draft.subject,
        body: draft.body,
        thread_id: draft.thread_id ?? null,
        in_reply_to: draft.in_reply_to ?? null,
      })
      .select()
      .single();

    if (!error && data) {
      // Realtime will add to list, but optimistic update for instant feedback
      setDrafts((prev) => {
        if (prev.some((d) => d.id === data.id)) return prev;
        return [data as DraftAction, ...prev];
      });
      return data;
    }
    return null;
  }, []);

  const updateDraft = useCallback(async (draftId: string, updates: { subject?: string; body?: string; to_email?: string }) => {
    const { error } = await supabase
      .from("draft_actions")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", draftId);

    if (!error) {
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, ...updates } : d))
      );
      return true;
    }
    return false;
  }, []);

  return { drafts, sentDrafts, loading, loadingSent, fetchDrafts, fetchSentDrafts, approveDraft, rejectDraft, saveDraft, updateDraft };
}
