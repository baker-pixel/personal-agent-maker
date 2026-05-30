import { useEffect, useState, useMemo } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Star, StarOff, Mail, Calendar as CalIcon, Users, Sparkles, Cake, Clock, Trash2 } from "lucide-react";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  is_vip: boolean;
  last_interaction_at: string | null;
  last_interaction_source: string | null;
  last_interaction_summary: string | null;
  interaction_count: number;
  ai_summary: string | null;
  ai_topics: string[] | null;
  enriched_at: string | null;
  birthday: string | null;
  stay_in_touch_days: number | null;
};

export default function Contacts() {
  const { agentName } = useAgent();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("is_vip", { ascending: false })
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) toast.error("Failed to load contacts");
    setContacts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("contacts-sync");
      if (error) throw error;
      toast.success(`Synced ${data?.synced ?? 0} contacts from your email & calendar`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed. Make sure Gmail & Calendar are connected.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleVip = async (c: Contact) => {
    const { error } = await supabase.from("contacts").update({ is_vip: !c.is_vip }).eq("id", c.id);
    if (error) return toast.error("Failed to update");
    setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_vip: !x.is_vip } : x)));
  };

  const enrichContact = async () => {
    if (!editing) return;
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("contact-enrich", {
        body: { contactId: editing.id },
      });
      if (error) throw error;
      toast.success(data?.emailsAnalyzed ? `Analyzed ${data.emailsAnalyzed} emails` : "Enriched");
      setEditing({ ...editing, ai_summary: data.summary, ai_topics: data.topics, enriched_at: new Date().toISOString() });
      load();
    } catch (e: any) {
      toast.error(e?.message || "AI enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  const deleteContact = async () => {
    if (!editing) return;
    if (!confirm(`Remove ${editing.name} from your contacts?`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", editing.id);
    if (error) return toast.error("Failed to delete");
    toast.success("Contact removed");
    setEditing(null);
    setContacts((prev) => prev.filter((c) => c.id !== editing.id));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("contacts")
      .update({
        name: editing.name,
        company: editing.company,
        role: editing.role,
        notes: editing.notes,
        birthday: editing.birthday || null,
        stay_in_touch_days: editing.stay_in_touch_days || null,
      })
      .eq("id", editing.id);
    if (error) return toast.error("Failed to save");
    toast.success("Contact updated");
    setEditing(null);
    load();
  };

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.company?.toLowerCase().includes(s) ||
      c.role?.toLowerCase().includes(s) ||
      c.ai_topics?.some((t) => t.toLowerCase().includes(s))
    );
  });

  // Stay-in-touch reminders: VIPs or contacts with stay_in_touch_days set, who haven't been heard from
  const reminders = useMemo(() => {
    const today = new Date();
    const stale = contacts
      .filter((c) => {
        const interval = c.stay_in_touch_days || (c.is_vip ? 30 : null);
        if (!interval || !c.last_interaction_at) return false;
        const days = differenceInDays(today, new Date(c.last_interaction_at));
        return days >= interval;
      })
      .slice(0, 3);

    const birthdays = contacts.filter((c) => {
      if (!c.birthday) return false;
      const b = new Date(c.birthday);
      let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      if (next < today) next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
      const days = differenceInDays(next, today);
      return days >= 0 && days <= 14;
    }).slice(0, 3);

    return { stale, birthdays };
  }, [contacts]);

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      <div className="max-w-4xl mx-auto pl-4 pr-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif text-foreground flex items-center gap-2">
              <Users className="w-7 h-7 text-accent" /> Contacts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              People {agentName} remembers from your email & calendar
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing} size="sm">
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync
          </Button>
        </div>

        {(reminders.stale.length > 0 || reminders.birthdays.length > 0) && (
          <Card className="p-4 bg-accent/5 border-accent/20">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Stay in touch
            </h3>
            <div className="space-y-1.5">
              {reminders.birthdays.map((c) => (
                <div key={`b-${c.id}`} className="flex items-center gap-2 text-sm cursor-pointer hover:text-accent" onClick={() => setEditing(c)}>
                  <Cake className="w-3.5 h-3.5 text-accent" />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs">birthday {format(new Date(c.birthday!), "MMM d")}</span>
                </div>
              ))}
              {reminders.stale.map((c) => (
                <div key={`s-${c.id}`} className="flex items-center gap-2 text-sm cursor-pointer hover:text-accent" onClick={() => setEditing(c)}>
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs">last heard {formatDistanceToNow(new Date(c.last_interaction_at!), { addSuffix: true })}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, company, topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {contacts.length === 0
              ? "No contacts yet. Click Sync to import people from your email & calendar."
              : "No contacts match your search."}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <Card
                key={c.id}
                className="p-4 hover:bg-secondary/40 cursor-pointer transition-colors"
                onClick={() => setEditing(c)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{c.name}</h3>
                      {c.is_vip && <Badge variant="default" className="bg-accent text-accent-foreground">VIP</Badge>}
                      {c.role && <span className="text-xs text-muted-foreground">{c.role}{c.company ? ` · ${c.company}` : ""}</span>}
                    </div>
                    {c.email && <p className="text-sm text-muted-foreground truncate">{c.email}</p>}
                    {c.ai_summary && (
                      <p className="text-xs text-foreground/80 mt-1.5 line-clamp-2 italic">{c.ai_summary}</p>
                    )}
                    {c.ai_topics && c.ai_topics.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {c.ai_topics.slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t}</span>
                        ))}
                      </div>
                    )}
                    {c.last_interaction_summary && !c.ai_summary && (
                      <p className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-1">
                        {c.last_interaction_source === "calendar" ? <CalIcon className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {c.last_interaction_summary}
                        {c.last_interaction_at && (
                          <span className="ml-1">· {formatDistanceToNow(new Date(c.last_interaction_at), { addSuffix: true })}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVip(c); }}
                    className="p-1 hover:bg-secondary rounded"
                    aria-label="Toggle VIP"
                  >
                    {c.is_vip ? <Star className="w-4 h-4 fill-accent text-accent" /> : <StarOff className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {/* AI Summary section */}
              <Card className="p-3 bg-accent/5 border-accent/20">
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                    <Sparkles className="w-3.5 h-3.5" /> AI Brief
                  </Label>
                  <Button size="sm" variant="ghost" onClick={enrichContact} disabled={enriching} className="h-7 text-xs">
                    {enriching ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    {editing.ai_summary ? "Regenerate" : "Generate"}
                  </Button>
                </div>
                {editing.ai_summary ? (
                  <>
                    <p className="text-sm text-foreground/90">{editing.ai_summary}</p>
                    {editing.ai_topics && editing.ai_topics.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {editing.ai_topics.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t}</span>
                        ))}
                      </div>
                    )}
                    {editing.enriched_at && (
                      <p className="text-[10px] text-muted-foreground mt-2">Updated {formatDistanceToNow(new Date(editing.enriched_at), { addSuffix: true })}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Click Generate to scan recent emails and build a brief.</p>
                )}
              </Card>

              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={editing.email || ""} disabled /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Company</Label><Input value={editing.company || ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} /></div>
                <div><Label>Role</Label><Input value={editing.role || ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1"><Cake className="w-3 h-3" /> Birthday</Label>
                  <Input type="date" value={editing.birthday || ""} onChange={(e) => setEditing({ ...editing, birthday: e.target.value })} />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Clock className="w-3 h-3" /> Reach out every</Label>
                  <Input type="number" placeholder="days" value={editing.stay_in_touch_days || ""} onChange={(e) => setEditing({ ...editing, stay_in_touch_days: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
              </div>
              <div><Label>Notes</Label><Textarea rows={3} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder={`Anything ${agentName} should remember about this person...`} /></div>
              <p className="text-xs text-muted-foreground">{editing.interaction_count} interactions tracked</p>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={deleteContact} className="text-destructive hover:text-destructive mr-auto">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
