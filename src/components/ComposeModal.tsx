import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Sparkles, Loader2, Check, ChevronDown, Minus, Maximize2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useToast } from "@/hooks/use-toast";

interface Recipient { name?: string; email: string; }

interface Props {
  onClose: () => void;
  defaultTo?: Recipient;
  defaultSubject?: string;
  defaultBody?: string;
}

// ── Contacts autocomplete ─────────────────────────────────────────────────────

function useContactSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<{ name: string; email: string }[]>([]);

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    supabase
      .from("contacts")
      .select("name, email")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .not("email", "is", null)
      .limit(6)
      .then(({ data }) => {
        if (!cancelled) setSuggestions(data?.filter(c => c.email) as any || []);
      });
    return () => { cancelled = true; };
  }, [query]);

  return suggestions;
}

// ── Recipient pill ────────────────────────────────────────────────────────────

function RecipientPill({ recipient, onRemove }: { recipient: Recipient; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium max-w-[180px]">
      <span className="truncate">{recipient.name || recipient.email}</span>
      <button onClick={onRemove} className="shrink-0 hover:text-destructive transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── Main compose modal ────────────────────────────────────────────────────────

export function ComposeModal({ onClose, defaultTo, defaultSubject = "", defaultBody = "" }: Props) {
  const { agentName } = useAgent();
  const { toast } = useToast();

  const [recipients, setRecipients] = useState<Recipient[]>(defaultTo ? [defaultTo] : []);
  const [toInput, setToInput] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useContactSuggestions(toInput);
  const toInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const addRecipient = useCallback((r: Recipient) => {
    if (!r.email) return;
    setRecipients(prev => {
      if (prev.some(p => p.email.toLowerCase() === r.email.toLowerCase())) return prev;
      return [...prev, r];
    });
    setToInput("");
    setShowSuggestions(false);
    setTimeout(() => bodyRef.current?.focus(), 50);
  }, []);

  const handleToKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && toInput.trim()) {
      e.preventDefault();
      const val = toInput.trim().replace(/,$/, "");
      const m = val.match(/^(.+?)\s*<([^>]+)>$/);
      if (m) addRecipient({ name: m[1].trim(), email: m[2].trim() });
      else if (val.includes("@")) addRecipient({ email: val });
    }
    if (e.key === "Backspace" && !toInput && recipients.length > 0) {
      setRecipients(prev => prev.slice(0, -1));
    }
  };

  const handleSend = async () => {
    if (recipients.length === 0) { toast({ title: "Add a recipient", variant: "destructive" }); return; }
    if (!subject.trim()) { toast({ title: "Add a subject", variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: "Write a message", variant: "destructive" }); return; }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const toStr = recipients.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(", ");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: toStr, subject: subject.trim(), emailBody: body.trim() }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed to send");

      toast({ title: "Email sent", description: `To: ${recipients.map(r => r.name || r.email).join(", ")}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleAiDraft = async () => {
    if (!subject.trim() && !body.trim()) {
      toast({ title: "Add a subject or intent first", description: "Give the AI something to work with", variant: "destructive" });
      return;
    }
    setAiDrafting(true);
    try {
      const toName = recipients[0]?.name || recipients[0]?.email || "the recipient";
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-draft-compose`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_name: toName,
          subject: subject.trim(),
          intent: body.trim() || subject.trim(),
        }),
      });

      if (!resp.ok) throw new Error("AI draft failed");
      const result = await resp.json();
      if (result.body) setBody(result.body);
      else throw new Error("No draft returned");
    } catch (err: any) {
      toast({ title: "AI draft failed", description: err.message || "Please try again", variant: "destructive" });
    } finally {
      setAiDrafting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: "spring", damping: 28, stiffness: 380 }}
        className={`fixed z-50 bg-card border border-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden
          ${minimized
            ? "bottom-4 right-4 w-72 h-12"
            : "bottom-4 right-4 w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh]"
          }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
          <span className="text-sm font-semibold text-foreground">New Email</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setMinimized(v => !v)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* To field */}
            <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border/20 relative">
              <span className="text-xs font-medium text-muted-foreground pt-1 shrink-0 w-10">To</span>
              <div className="flex-1 flex flex-wrap gap-1 min-h-[24px]">
                {recipients.map((r, i) => (
                  <RecipientPill key={i} recipient={r} onRemove={() => setRecipients(prev => prev.filter((_, j) => j !== i))} />
                ))}
                <div className="relative flex-1 min-w-[120px]">
                  <input
                    ref={toInputRef}
                    value={toInput}
                    onChange={e => { setToInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={handleToKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder={recipients.length === 0 ? "Recipients" : ""}
                    className="w-full text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/40"
                  />
                  {/* Suggestions dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden">
                      {suggestions.map(s => (
                        <button
                          key={s.email}
                          onMouseDown={() => addRecipient(s)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                            {s.name?.[0]?.toUpperCase() || s.email[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subject field */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20">
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-10">Subj</span>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Body */}
            <textarea
              ref={bodyRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              className="flex-1 px-4 py-3 text-sm bg-transparent outline-none resize-none text-foreground placeholder:text-muted-foreground/40 min-h-[160px]"
            />

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border/20 shrink-0">
              <button
                onClick={handleSend}
                disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
                  : <><Send className="w-3.5 h-3.5" />Send</>}
              </button>

              <button
                onClick={handleAiDraft}
                disabled={aiDrafting}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {aiDrafting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Drafting…</>
                  : <><Sparkles className="w-3.5 h-3.5" />AI Draft</>}
              </button>

              <span className="ml-auto text-xs text-muted-foreground/40">
                {body.length > 0 && `${body.length} chars`}
              </span>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
