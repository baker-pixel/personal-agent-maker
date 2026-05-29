import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Flame, Loader2, RefreshCw, Send, Plus, Trash2, Settings, CheckCircle2, Archive, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { LeadSlaSettings } from "@/components/LeadSlaSettings";

type LeadStatus = "new" | "drafted" | "responded" | "qualified" | "closed" | "archived";
type Lead = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  snippet: string | null;
  source: string | null;
  confidence: number;
  status: LeadStatus;
  draft_id: string | null;
  received_at: string;
  responded_at: string | null;
};
type Draft = { id: string; body: string | null; subject: string | null; to_email: string | null };
type Rule = { id: string; rule_type: string; pattern: string; label: string | null; priority: number; enabled: boolean };

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSla, setShowSla] = useState(false);
  const [newRule, setNewRule] = useState({ rule_type: "sender_domain", pattern: "", label: "", priority: 70 });

  const load = async () => {
    setLoading(true);
    const [leadsRes, rulesRes] = await Promise.all([
      supabase.from("leads").select("*").order("received_at", { ascending: false }).limit(200),
      supabase.from("lead_rules").select("*").order("created_at", { ascending: false }),
    ]);
    if (leadsRes.error) toast.error("Failed to load leads");
    setLeads(leadsRes.data || []);
    setRules(rulesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("lead-detector");
      if (error) throw error;
      toast.success(`Detected ${data?.detected ?? 0} leads (${data?.drafted ?? 0} drafted)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Scan failed. Make sure Gmail is connected.");
    } finally {
      setScanning(false);
    }
  };

  const openLeadDetails = async (lead: Lead) => {
    setOpenLead(lead);
    if (lead.draft_id) {
      const { data } = await supabase.from("draft_actions").select("id, body, subject, to_email").eq("id", lead.draft_id).maybeSingle();
      setDraft(data);
    } else {
      setDraft(null);
    }
  };

  const updateLead = async (id: string, status: LeadStatus) => {
    const updates: any = { status };
    if (status === "responded") updates.responded_at = new Date().toISOString();
    const { error } = await supabase.from("leads").update(updates).eq("id", id);
    if (error) return toast.error("Failed to update");
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    if (openLead?.id === id) setOpenLead({ ...openLead, ...updates });
  };

  const sendDraft = async () => {
    if (!draft || !openLead) return;
    try {
      const { error } = await supabase.functions.invoke("gmail-send", {
        body: {
          to: draft.to_email,
          subject: draft.subject,
          body: draft.body,
        },
      });
      if (error) throw error;
      await supabase.from("draft_actions").update({ status: "sent" }).eq("id", draft.id);
      await updateLead(openLead.id, "responded");
      toast.success("Reply sent");
      setOpenLead(null);
    } catch (e: any) {
      toast.error(e?.message || "Send failed");
    }
  };

  const addRule = async () => {
    if (!newRule.pattern.trim()) return toast.error("Pattern required");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("lead_rules").insert({
      ...newRule,
      rule_type: newRule.rule_type as "sender_domain" | "subject_keyword" | "recipient_inbox",
      user_id: user.id,
    });
    if (error) return toast.error("Failed to add rule");
    toast.success("Rule added");
    setNewRule({ rule_type: "sender_domain", pattern: "", label: "", priority: 70 });
    load();
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    await supabase.from("lead_rules").update({ enabled }).eq("id", id);
    setRules((r) => r.map((x) => (x.id === id ? { ...x, enabled } : x)));
  };

  const deleteRule = async (id: string) => {
    await supabase.from("lead_rules").delete().eq("id", id);
    setRules((r) => r.filter((x) => x.id !== id));
    toast.success("Rule deleted");
  };

  const filterByStatus = (s: LeadStatus[]) => leads.filter((l) => s.includes(l.status));
  const counts = {
    hot: filterByStatus(["new", "drafted"]).length,
    responded: filterByStatus(["responded"]).length,
    qualified: filterByStatus(["qualified"]).length,
    closed: filterByStatus(["closed", "archived"]).length,
  };

  const renderLeadList = (list: Lead[]) =>
    list.length === 0 ? (
      <Card className="p-8 text-center text-muted-foreground">No leads here.</Card>
    ) : (
      <div className="space-y-2">
        {list.map((l) => (
          <Card key={l.id} className="p-4 cursor-pointer hover:bg-secondary/40" onClick={() => openLeadDetails(l)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground truncate">{l.from_name || l.from_email}</h3>
                  {l.source && <Badge variant="secondary">{l.source}</Badge>}
                  {l.status === "drafted" && <Badge className="bg-accent text-accent-foreground">Draft ready</Badge>}
                  {l.status === "new" && <Badge variant="destructive">Needs reply</Badge>}
                </div>
                <p className="text-sm text-muted-foreground truncate mt-1">{l.subject}</p>
                <p className="text-xs text-muted-foreground truncate mt-1">{l.snippet}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(l.received_at), { addSuffix: true })} · {l.confidence}% confidence
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      <div className="max-w-4xl mx-auto px-4 pt-14 pb-6 space-y-4">
        <div className="flex items-start justify-between gap-3 pr-10 sm:pr-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif text-foreground flex items-center gap-2">
              <Flame className="w-6 h-6 sm:w-7 sm:h-7 text-accent" /> Leads
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">New inquiries Normy detected from your inbox</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end shrink-0">
            <Button onClick={() => setShowSla(true)} size="sm" variant="outline" className="px-2 sm:px-3">
              <Clock className="w-4 h-4" /> <span className="hidden sm:inline ml-1">SLA</span>
            </Button>
            <Button onClick={() => setShowRules(true)} size="sm" variant="outline" className="px-2 sm:px-3">
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline ml-1">Rules</span>
            </Button>
            <Button onClick={scan} disabled={scanning} size="sm" className="px-2 sm:px-3">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="hidden sm:inline ml-2">Scan</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
        ) : (
          <Tabs defaultValue="hot">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="hot" className="text-xs sm:text-sm px-1 sm:px-3">
                <span className="sm:hidden">🔥 {counts.hot}</span>
                <span className="hidden sm:inline">🔥 Hot ({counts.hot})</span>
              </TabsTrigger>
              <TabsTrigger value="responded" className="text-xs sm:text-sm px-1 sm:px-3">
                <span className="sm:hidden">Replied {counts.responded}</span>
                <span className="hidden sm:inline">Responded ({counts.responded})</span>
              </TabsTrigger>
              <TabsTrigger value="qualified" className="text-xs sm:text-sm px-1 sm:px-3">
                <span className="sm:hidden">Qual. {counts.qualified}</span>
                <span className="hidden sm:inline">Qualified ({counts.qualified})</span>
              </TabsTrigger>
              <TabsTrigger value="closed" className="text-xs sm:text-sm px-1 sm:px-3">
                <span className="sm:hidden">Closed {counts.closed}</span>
                <span className="hidden sm:inline">Closed ({counts.closed})</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="hot">{renderLeadList(filterByStatus(["new", "drafted"]))}</TabsContent>
            <TabsContent value="responded">{renderLeadList(filterByStatus(["responded"]))}</TabsContent>
            <TabsContent value="qualified">{renderLeadList(filterByStatus(["qualified"]))}</TabsContent>
            <TabsContent value="closed">{renderLeadList(filterByStatus(["closed", "archived"]))}</TabsContent>
          </Tabs>
        )}
      </div>

      {/* Lead detail dialog */}
      <Dialog open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-accent" /> {openLead?.from_name || openLead?.from_email}
            </DialogTitle>
          </DialogHeader>
          {openLead && (
            <div className="space-y-3">
              <div className="text-sm">
                <p><strong>From:</strong> {openLead.from_email}</p>
                <p><strong>Source:</strong> {openLead.source} ({openLead.confidence}% confident)</p>
                <p><strong>Subject:</strong> {openLead.subject}</p>
              </div>
              <Card className="p-3 bg-secondary/40 text-sm">{openLead.snippet}</Card>
              {draft && (
                <div className="space-y-2">
                  <Label>Normy's draft reply (edit before sending)</Label>
                  <Textarea
                    rows={8}
                    value={draft.body || ""}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openLead && updateLead(openLead.id, "qualified")}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Qualify
            </Button>
            <Button variant="outline" size="sm" onClick={() => openLead && updateLead(openLead.id, "archived")}>
              <Archive className="w-4 h-4 mr-1" /> Archive
            </Button>
            {draft && (
              <Button onClick={sendDraft}>
                <Send className="w-4 h-4 mr-1" /> Send Reply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SLA dialog */}
      <Dialog open={showSla} onOpenChange={setShowSla}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-accent" /> Lead response SLA</DialogTitle>
          </DialogHeader>
          <LeadSlaSettings onClose={() => setShowSla(false)} />
        </DialogContent>
      </Dialog>

      {/* Rules dialog */}
      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Lead detection rules</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tell Normy what counts as a lead in addition to its built-in detection (Typeform, HubSpot, Calendly, etc).
            </p>
            <Card className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={newRule.rule_type} onValueChange={(v) => setNewRule({ ...newRule, rule_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sender_domain">Sender domain</SelectItem>
                      <SelectItem value="subject_keyword">Subject keyword</SelectItem>
                      <SelectItem value="recipient_inbox">Recipient inbox</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority (0-100)</Label>
                  <Input type="number" value={newRule.priority} onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 50 })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Pattern</Label>
                <Input
                  placeholder={newRule.rule_type === "sender_domain" ? "forms.mywebsite.com" : newRule.rule_type === "subject_keyword" ? "new booking" : "leads@mycompany.com"}
                  value={newRule.pattern}
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input placeholder="My website form" value={newRule.label} onChange={(e) => setNewRule({ ...newRule, label: e.target.value })} />
              </div>
              <Button onClick={addRule} size="sm" className="w-full"><Plus className="w-4 h-4 mr-1" /> Add rule</Button>
            </Card>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No custom rules yet.</p>
              ) : rules.map((r) => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label || r.pattern}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.rule_type} · {r.pattern} · priority {r.priority}</p>
                  </div>
                  <Switch checked={r.enabled} onCheckedChange={(v) => toggleRule(r.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="w-4 h-4 text-muted-foreground" /></Button>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
