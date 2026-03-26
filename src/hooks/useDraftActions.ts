import { useState, useEffect, useCallback } from "react";
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
  in_reply_to: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useDraftActions() {
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [sentDrafts, setSentDrafts] = useState<DraftAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSent, setLoadingSent] = useState(false);

  const fetchDrafts = useCallback(async () => {
    const { data, error } = await supabase
      .from("draft_actions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDrafts(data as unknown as DraftAction[]);
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
      setSentDrafts(data as unknown as DraftAction[]);
    }
    setLoadingSent(false);
  }, []);

  useEffect(() => {
    fetchDrafts();
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
    if (!resp.ok) {
      return { success: false, error: result.error || "Failed to send" };
    }

    // Remove from local state
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    return { success: true };
  }, []);

  const rejectDraft = useCallback(async (draftId: string) => {
    await supabase
      .from("draft_actions")
      .update({ status: "rejected", updated_at: new Date().toISOString() } as any)
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
        to_name: draft.to_name || null,
        subject: draft.subject,
        body: draft.body,
        thread_id: draft.thread_id || null,
        in_reply_to: draft.in_reply_to || null,
      } as any)
      .select()
      .single();

    if (!error && data) {
      setDrafts((prev) => [data as unknown as DraftAction, ...prev]);
      return data;
    }
    return null;
  }, []);

  return { drafts, loading, fetchDrafts, approveDraft, rejectDraft, saveDraft };
}
