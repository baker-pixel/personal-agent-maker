// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FollowUpEmail {
  id: string;
  nylas_message_id: string;
  from_name: string | null;
  from_address: string;
  subject: string | null;
  replied_at: string;
  received_at: string;
  category: string;
}

export function useFollowUpEmails() {
  const [emails, setEmails] = useState<FollowUpEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("email_metadata")
      .select("id, nylas_message_id, from_name, from_address, subject, replied_at, received_at, category")
      .not("replied_at", "is", null)
      .lt("replied_at", threshold)      // replied more than 48h ago
      .gte("replied_at", weekAgo)       // but within last 7 days
      .order("replied_at", { ascending: false })
      .limit(10);

    if (!error && data) setEmails(data as FollowUpEmail[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { emails, loading, refetch: fetch };
}