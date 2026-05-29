import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

export interface ByCategory {
  urgent: TriagedEmail[];
  needs_reply: TriagedEmail[];
  fyi: TriagedEmail[];
  newsletter: TriagedEmail[];
}

export function useTriagedEmails() {
  const [emails, setEmails] = useState<TriagedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("email_metadata")
      .select("*")
      .gte("received_at", cutoff)
      .order("received_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      setEmails(data as TriagedEmail[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEmails();

    const channelName = `email_metadata_${Math.random().toString(36).slice(2)}`;
    channelRef.current = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_metadata" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as TriagedEmail;
            setEmails((prev) => {
              if (prev.some((e) => e.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as TriagedEmail;
            setEmails((prev) =>
              prev.map((e) => (e.id === row.id ? row : e))
            );
          } else if (payload.eventType === "DELETE") {
            setEmails((prev) =>
              prev.filter((e) => e.id !== (payload.old as TriagedEmail).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchEmails]);

  const byCategory: ByCategory = {
    urgent: emails
      .filter((e) => e.category === "urgent")
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    needs_reply: emails
      .filter((e) => e.category === "needs_reply")
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    fyi: emails.filter((e) => e.category === "fyi"),
    newsletter: emails.filter((e) => e.category === "newsletter"),
  };

  const updateEmailCategory = useCallback(async (id: string, newCategory: EmailCategory) => {
    // Optimistic — move card instantly, no waiting for Realtime
    setEmails(prev => prev.map(e => e.id === id ? { ...e, category: newCategory } : e));
    const { error } = await supabase
      .from("email_metadata")
      .update({ category: newCategory })
      .eq("id", id);
    if (error) {
      // Revert on failure
      fetchEmails();
    }
  }, [fetchEmails]);

  return { emails, byCategory, loading, refetch: fetchEmails, updateEmailCategory };
}
