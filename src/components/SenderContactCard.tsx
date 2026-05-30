import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Star, Building2, ChevronDown, ChevronUp, Phone,
  Mail, Tag, Clock, Sparkles, UserPlus, StickyNote,
} from "lucide-react";
import { useSenderContact } from "@/hooks/useSenderContact";

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch { return ""; }
}

interface Props {
  fromAddress: string;
  fromName?: string | null;
  compact?: boolean; // true = inline one-liner, false = full card
}

export function SenderContactCard({ fromAddress, fromName, compact = false }: Props) {
  const navigate = useNavigate();
  const { contact, loading, notFound } = useSenderContact(fromAddress);
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1 animate-pulse">
        <div className="w-7 h-7 rounded-full bg-muted shrink-0" />
        <div className="h-3 bg-muted rounded w-32" />
      </div>
    );
  }

  // No contact found — show subtle "Add" prompt
  if (notFound) {
    return (
      <button
        onClick={() => navigate("/contacts")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-accent transition-colors"
      >
        <UserPlus className="w-3 h-3" />
        Add {fromName || fromAddress} to contacts
      </button>
    );
  }

  if (!contact) return null;

  const initials = contact.name
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  // ── Compact inline banner (used in EmailTriage card) ──────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/30">
        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          {contact.is_vip && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
          <span className="text-xs font-semibold text-foreground">{contact.name}</span>
          {contact.company && <span className="text-xs text-muted-foreground">@ {contact.company}</span>}
          {contact.role && <span className="text-xs text-muted-foreground/70">· {contact.role}</span>}
          {contact.interaction_count > 0 && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
              {contact.interaction_count} interaction{contact.interaction_count > 1 ? "s" : ""}
              {contact.last_interaction_at && ` · last ${timeAgo(contact.last_interaction_at)}`}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate(`/contacts`)}
          className="text-[10px] text-accent hover:underline shrink-0"
        >
          View
        </button>
      </div>
    );
  }

  // ── Full card (used in EmailView modal) ───────────────────────────────────
  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      {/* Always-visible header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          contact.is_vip ? "bg-yellow-500/20 text-yellow-600" : "bg-accent/20 text-accent"
        }`}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {contact.is_vip && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
            <span className="text-sm font-semibold text-foreground truncate">{contact.name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {contact.role && <span>{contact.role}</span>}
            {contact.role && contact.company && <span>·</span>}
            {contact.company && (
              <span className="flex items-center gap-0.5">
                <Building2 className="w-3 h-3" />
                {contact.company}
              </span>
            )}
            {contact.interaction_count > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {contact.interaction_count}x
                  {contact.last_interaction_at && ` · ${timeAgo(contact.last_interaction_at)}`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); navigate("/contacts"); }}
            className="text-[11px] text-accent hover:underline font-medium"
          >
            View
          </button>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-border/30">
          {/* AI summary */}
          {contact.ai_summary && (
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{contact.ai_summary}</p>
            </div>
          )}

          {/* Last interaction summary */}
          {contact.last_interaction_summary && (
            <div className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium">Last: </span>{contact.last_interaction_summary}
              </p>
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div className="flex items-start gap-2">
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{contact.notes}</p>
            </div>
          )}

          {/* Phone */}
          {contact.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <a href={`tel:${contact.phone}`} className="text-xs text-accent hover:underline">{contact.phone}</a>
            </div>
          )}

          {/* Email */}
          {contact.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{contact.email}</span>
            </div>
          )}

          {/* Tags */}
          {contact.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
              {contact.tags.map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Previous emails from this sender */}
          <PreviousEmails fromAddress={fromAddress} />
        </div>
      )}
    </div>
  );
}

// ── Recent emails from same sender ───────────────────────────────────────────

function PreviousEmails({ fromAddress }: { fromAddress: string }) {
  const [emails, setEmails] = useState<any[] | null>(null);

  useEffect(() => {
    supabase
      .from("email_metadata")
      .select("id, subject, received_at, category, replied_at")
      .ilike("from_address", fromAddress)
      .order("received_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setEmails(data || []));
  }, [fromAddress]);

  if (emails === null) {
    return <div className="text-xs text-muted-foreground/50 animate-pulse">Loading history…</div>;
  }
  if (emails.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Email history</p>
      <div className="space-y-1">
        {emails.map(e => (
          <div key={e.id} className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              e.category === "urgent" ? "bg-destructive" :
              e.category === "needs_reply" ? "bg-accent" : "bg-muted-foreground/30"
            }`} />
            <span className="text-xs text-foreground truncate flex-1">{e.subject || "(no subject)"}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(e.received_at)}</span>
            {e.replied_at && <span className="text-[10px] text-green-600 shrink-0">replied</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
