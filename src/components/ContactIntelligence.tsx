import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Mail, Calendar, Clock, ChevronDown, ChevronUp,
  Search, Star, Plus, Phone, Building2, UserCircle, X, Loader2,
  Pencil, Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbContact {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  notes: string | null;
  is_vip: boolean;
  interaction_count: number;
  last_interaction_at: string | null;
  ai_summary: string | null;
  ai_topics: string[] | null;
  tags: string[];
  stay_in_touch_days: number | null;
  created_at: string;
}

interface NewContactForm {
  name: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  notes: string;
  is_vip: boolean;
}

const EMPTY_FORM: NewContactForm = {
  name: "", email: "", company: "", role: "", phone: "", notes: "", is_vip: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relationship(c: DbContact): "key" | "regular" | "new" {
  if (c.is_vip) return "key";
  if (c.interaction_count > 10) return "regular";
  return "new";
}

function lastInteractionLabel(at: string | null): string {
  if (!at) return "Never";
  try { return formatDistanceToNow(new Date(at), { addSuffix: true }); }
  catch { return "Unknown"; }
}

const relationshipColors: Record<string, string> = {
  key: "bg-primary/10 text-primary",
  regular: "bg-accent/10 text-accent",
  new: "bg-muted text-muted-foreground",
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ContactIntelligence = () => {
  const { agentName } = useAgent();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<NewContactForm>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("last_interaction_at", { ascending: false, nullsFirst: false });
    if (error) { console.error(error); return; }
    setContacts((data as DbContact[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContacts();
    channelRef.current = supabase
      .channel("contacts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, fetchContacts)
      .subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  }, [fetchContacts]);

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const { error } = await supabase.from("contacts").insert({
      user_id: session.user.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      role: form.role.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      is_vip: form.is_vip,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Failed to create contact", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contact created" });
    setForm(EMPTY_FORM);
    setShowCreate(false);
  };

  // ── Inline edit save ───────────────────────────────────────────────────────

  const handleEditSave = async (id: string) => {
    const { error } = await supabase
      .from("contacts")
      .update({
        name: editDraft.name?.trim(),
        email: editDraft.email?.trim() || null,
        company: editDraft.company?.trim() || null,
        role: editDraft.role?.trim() || null,
        phone: editDraft.phone?.trim() || null,
        notes: editDraft.notes?.trim() || null,
        is_vip: editDraft.is_vip,
      } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    setEditDraft({});
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const keyCount = contacts.filter((c) => c.is_vip).length;
  const totalInteractions = contacts.reduce((s, c) => s + c.interaction_count, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-2">Contact Intelligence</h1>
          <p className="text-muted-foreground">
            {agentName} tracks your key relationships and interaction history.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Contact
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Key Contacts", value: keyCount, icon: Star },
          { label: "Total Contacts", value: contacts.length, icon: Users },
          { label: "Total Interactions", value: totalInteractions, icon: Mail },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card rounded-2xl p-4 text-center">
            <Icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass-card rounded-2xl p-3 flex items-center gap-3 mb-6">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading contacts…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {contacts.length === 0
              ? "No contacts yet. Add one or sync your Google Contacts."
              : "No contacts match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((contact, index) => {
            const rel = relationship(contact);
            const isExpanded = expandedId === contact.id;
            const isEditing = editingId === contact.id;

            return (
              <div
                key={contact.id}
                className="glass-card rounded-2xl overflow-hidden transition-all duration-300"
                style={{ animation: `fade-up 0.4s ease-out ${index * 0.05}s both` }}
              >
                {/* Row */}
                <button
                  className="w-full flex items-center gap-4 p-5 text-left"
                  onClick={() => {
                    if (isEditing) return;
                    setExpandedId(isExpanded ? null : contact.id);
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                    {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{contact.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${relationshipColors[rel]}`}>
                        {rel}
                      </span>
                      {contact.is_vip && <Star className="w-3 h-3 text-primary fill-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[contact.role, contact.company].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{lastInteractionLabel(contact.last_interaction_at)}</p>
                    <p className="text-xs text-muted-foreground">{contact.interaction_count} interactions</p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                    {/* Edit toggle */}
                    <div className="flex justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleEditSave(contact.id)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
                          >
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditDraft({}); }}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground"
                          >
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(contact.id);
                            setEditDraft({
                              name: contact.name,
                              email: contact.email ?? "",
                              company: contact.company ?? "",
                              role: contact.role ?? "",
                              phone: contact.phone ?? "",
                              notes: contact.notes ?? "",
                              is_vip: contact.is_vip,
                            });
                          }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <EditForm draft={editDraft} onChange={setEditDraft} />
                    ) : (
                      <>
                        {/* Contact details */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {contact.email && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              <a href={`mailto:${contact.email}`} className="hover:text-foreground truncate">{contact.email}</a>
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span>{contact.phone}</span>
                            </div>
                          )}
                          {contact.company && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Building2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{contact.company}</span>
                            </div>
                          )}
                          {contact.role && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <UserCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{contact.role}</span>
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 text-center">
                          <div className="p-2 rounded-xl bg-muted/50">
                            <p className="text-lg font-bold text-foreground">{contact.interaction_count}</p>
                            <p className="text-xs text-muted-foreground">Interactions</p>
                          </div>
                          <div className="p-2 rounded-xl bg-muted/50">
                            <p className="text-lg font-bold text-foreground">
                              {contact.stay_in_touch_days ?? "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">Stay-in-touch (days)</p>
                          </div>
                        </div>

                        {/* AI summary */}
                        {(contact.ai_summary || contact.notes) && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              {contact.ai_summary ? "AI Notes" : "Notes"}
                            </h4>
                            <p className="text-sm text-foreground bg-muted/30 rounded-xl p-3">
                              {contact.ai_summary ?? contact.notes}
                            </p>
                          </div>
                        )}

                        {/* Topics */}
                        {contact.ai_topics && contact.ai_topics.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Topics</h4>
                            <div className="flex flex-wrap gap-2">
                              {contact.ai_topics.map((topic) => (
                                <span key={topic} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tags */}
                        {contact.tags && contact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {contact.tags.map((tag) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">New Contact</h2>
              <button onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <Field label="Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Jane Smith" />
              <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="jane@example.com" type="email" />
              <Field label="Company" value={form.company} onChange={(v) => setForm((f) => ({ ...f, company: v }))} placeholder="Acme Corp" />
              <Field label="Role" value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))} placeholder="VP of Sales" />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+1 555 000 0000" />
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any context about this person…"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_vip}
                  onChange={(e) => setForm((f) => ({ ...f, is_vip: e.target.checked }))}
                  className="rounded"
                />
                Mark as key contact (VIP)
              </label>
            </div>

            <div className="flex gap-3 p-5 border-t border-border">
              <button
                onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function EditForm({
  draft,
  onChange,
}: {
  draft: Partial<NewContactForm>;
  onChange: (d: Partial<NewContactForm>) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Name" value={draft.name ?? ""} onChange={(v) => onChange({ ...draft, name: v })} />
      <Field label="Email" value={draft.email ?? ""} onChange={(v) => onChange({ ...draft, email: v })} type="email" />
      <Field label="Company" value={draft.company ?? ""} onChange={(v) => onChange({ ...draft, company: v })} />
      <Field label="Role" value={draft.role ?? ""} onChange={(v) => onChange({ ...draft, role: v })} />
      <Field label="Phone" value={draft.phone ?? ""} onChange={(v) => onChange({ ...draft, phone: v })} />
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={draft.is_vip ?? false}
          onChange={(e) => onChange({ ...draft, is_vip: e.target.checked })}
          className="rounded"
        />
        Key contact (VIP)
      </label>
    </div>
  );
}
