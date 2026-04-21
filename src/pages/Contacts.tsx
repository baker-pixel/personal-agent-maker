import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, Star, StarOff, Mail, Calendar as CalIcon, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
};

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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
    setContacts(data || []);
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

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("contacts")
      .update({
        name: editing.name,
        company: editing.company,
        role: editing.role,
        notes: editing.notes,
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
      c.role?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)]">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-serif text-foreground flex items-center gap-2">
              <Users className="w-7 h-7 text-accent" /> Contacts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              People Normy remembers from your email & calendar
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing} size="sm">
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, company..."
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
                    {c.last_interaction_summary && (
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
        <DialogContent>
          <DialogHeader><DialogTitle>Edit contact</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={editing.email || ""} disabled /></div>
              <div><Label>Company</Label><Input value={editing.company || ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} /></div>
              <div><Label>Role</Label><Input value={editing.role || ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea rows={4} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Anything Normy should remember about this person..." /></div>
              <p className="text-xs text-muted-foreground">{editing.interaction_count} interactions tracked</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
