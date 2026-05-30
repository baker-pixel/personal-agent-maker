import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Download, Pencil, Plus, Search, Trash2, Users } from "lucide-react";

type Status = "invited" | "signed_up" | "active" | "churned" | "declined";
type Tier = "vip" | "standard" | "waitlist";

interface BetaUser {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  phone: string | null;
  source: string | null;
  status: Status;
  tier: Tier;
  notes: string | null;
  invited_at: string | null;
  signed_up_at: string | null;
  activated_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

const STATUSES: Status[] = ["invited", "signed_up", "active", "churned", "declined"];
const TIERS: Tier[] = ["vip", "standard", "waitlist"];

const STATUS_STYLE: Record<Status, string> = {
  invited: "bg-amber-100 text-amber-900 border-amber-200",
  signed_up: "bg-blue-100 text-blue-900 border-blue-200",
  active: "bg-emerald-100 text-emerald-900 border-emerald-200",
  churned: "bg-rose-100 text-rose-900 border-rose-200",
  declined: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

const TIER_STYLE: Record<Tier, string> = {
  vip: "bg-primary text-primary-foreground",
  standard: "bg-secondary text-secondary-foreground",
  waitlist: "bg-muted text-muted-foreground",
};

const empty = {
  name: "",
  email: "",
  company: "",
  role: "",
  phone: "",
  source: "",
  status: "invited" as Status,
  tier: "standard" as Tier,
  notes: "",
};

export default function BetaCrm() {
  const [rows, setRows] = useState<BetaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BetaUser | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("beta_users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data as BetaUser[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      return [r.name, r.email, r.company, r.role, r.source, r.notes]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    STATUSES.forEach((s) => (c[s] = 0));
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (r: BetaUser) => {
    setEditing(r);
    setForm({
      name: r.name,
      email: r.email,
      company: r.company ?? "",
      role: r.role ?? "",
      phone: r.phone ?? "",
      source: r.source ?? "",
      status: r.status,
      tier: r.tier,
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      company: form.company.trim() || null,
      role: form.role.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source.trim() || null,
      status: form.status,
      tier: form.tier,
      notes: form.notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await (supabase as any).from("beta_users").update(payload).eq("id", editing.id));
    } else {
      payload.created_by = user?.id ?? null;
      payload.invited_at = new Date().toISOString();
      ({ error } = await (supabase as any).from("beta_users").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Updated" : "Added" });
    setOpen(false);
    load();
  };

  const remove = async (r: BetaUser) => {
    if (!confirm(`Remove ${r.name}?`)) return;
    const { error } = await (supabase as any).from("beta_users").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed" });
    load();
  };

  const exportCsv = () => {
    const headers = ["name","email","company","role","phone","source","status","tier","notes","invited_at","signed_up_at","activated_at","last_contacted_at","created_at"];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...filtered.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beta-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7" /> Beta Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Shared CRM for tracking beta testers. {rows.length} total.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <FilterChip label="All" count={counts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {STATUSES.map((s) => (
          <FilterChip key={s} label={s.replace("_", " ")} count={counts[s]} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, company, notes…" className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No beta users yet. Click "Add User" to start.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}{r.role && <div className="text-xs text-muted-foreground">{r.role}</div>}</TableCell>
                  <TableCell className="text-sm"><a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a></TableCell>
                  <TableCell className="text-sm">{r.company || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLE[r.status]}>{r.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell><Badge className={TIER_STYLE[r.tier]}>{r.tier}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.source || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.notes || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit beta user" : "Add beta user"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Role"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Source"><Input placeholder="referral, twitter, demo…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tier">
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as Tier })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes"><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-md border text-sm capitalize transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}
