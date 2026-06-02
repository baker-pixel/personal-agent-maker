import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Check, Loader2 } from "lucide-react";

interface ContactData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
  is_vip?: boolean;
  birthday?: string;
}

async function extractErrMsg(e: any): Promise<string> {
  if (e?.context && typeof e.context.json === "function") {
    try { const b = await e.context.json(); return b?.error || b?.message || e.message || "Unknown error"; } catch {}
  }
  const raw = e?.message || e?.error || "Unknown error";
  try { const p = JSON.parse(raw); return p?.error || p?.message || raw; } catch { return raw; }
}

export function ContactJsonParser({ text }: { text: string }) {
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [loadingIndices, setLoadingIndices] = useState<Set<number>>(new Set());

  const contacts = useMemo(() => {
    const results: ContactData[] = [];

    // Primary: fenced ```contact-json``` block
    const fencedRegex = /```contact-json\s*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = fencedRegex.exec(text)) !== null) {
      try {
        const p = JSON.parse(match[1].trim());
        if (p.name) results.push(p);
      } catch {}
    }

    // Fallback: bare JSON with name + (email or phone or company)
    if (results.length === 0) {
      let depth = 0, start = -1, buf = "";
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "{") { if (depth === 0) { start = i; buf = ""; } depth++; }
        if (depth > 0) buf += c;
        if (c === "}") {
          depth--;
          if (depth === 0 && start !== -1) {
            try {
              const p = JSON.parse(buf);
              if (p.name && (p.email || p.phone || p.company)) results.push(p);
            } catch {}
            start = -1; buf = "";
          }
        }
      }
    }

    return results;
  }, [text]);

  if (contacts.length === 0) return null;

  const handleAdd = async (contact: ContactData, index: number) => {
    setLoadingIndices(prev => new Set(prev).add(index));
    try {
      const { data, error } = await supabase.functions.invoke("contact-create", { body: contact });
      if (error) throw error;
      if (data?.code === "DUPLICATE" || data?.code === "DUPLICATE_NAME") {
        toast.warning(`${contact.name} is already in your contacts`);
        setAddedIndices(prev => new Set(prev).add(index));
        return;
      }
      setAddedIndices(prev => new Set(prev).add(index));
      toast.success(`${contact.name} added to contacts`);
    } catch (e: any) {
      const msg = await extractErrMsg(e);
      if (msg.includes("DUPLICATE")) {
        toast.warning(`${contact.name} is already in your contacts`);
        setAddedIndices(prev => new Set(prev).add(index));

      } else {
        toast.error(`Failed to add contact: ${msg}`);
      }
    } finally {
      setLoadingIndices(prev => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {contacts.map((contact, i) => (
        <button
          key={i}
          onClick={() => handleAdd(contact, i)}
          disabled={addedIndices.has(i) || loadingIndices.has(i)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          {loadingIndices.has(i) ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding contact…</>
          ) : addedIndices.has(i) ? (
            <><Check className="w-3.5 h-3.5" /> Added {contact.name}</>
          ) : (
            <><UserPlus className="w-3.5 h-3.5" /> Add contact: {contact.name}{contact.company ? ` · ${contact.company}` : ""}</>
          )}
        </button>
      ))}
    </div>
  );
}
