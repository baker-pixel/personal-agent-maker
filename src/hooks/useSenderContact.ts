import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SenderContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  is_vip: boolean;
  last_interaction_at: string | null;
  last_interaction_summary: string | null;
  interaction_count: number;
  ai_summary: string | null;
  birthday: string | null;
}

export function useSenderContact(fromAddress: string | null | undefined) {
  const [contact, setContact] = useState<SenderContact | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!fromAddress) { setContact(null); setNotFound(false); return; }

    let cancelled = false;
    setLoading(true);
    setContact(null);
    setNotFound(false);

    supabase
      .from("contacts")
      .select("id, name, email, company, role, phone, notes, tags, is_vip, last_interaction_at, last_interaction_summary, interaction_count, ai_summary, birthday")
      .ilike("email", fromAddress.trim())
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setContact(data as SenderContact);
        else setNotFound(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [fromAddress]);

  return { contact, loading, notFound };
}
