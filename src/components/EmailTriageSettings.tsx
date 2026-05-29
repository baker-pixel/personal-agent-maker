import { useState, useEffect } from "react";
import { Plus, X, Brain, ShieldAlert, ShieldOff, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TriagePrefs {
  vip_senders: string[];
  dismiss_senders: string[];
  priority_keywords: string[];
  dismiss_keywords: string[];
  custom_instructions: string;
}

const defaultPrefs: TriagePrefs = {
  vip_senders: [],
  dismiss_senders: [],
  priority_keywords: [],
  dismiss_keywords: [],
  custom_instructions: "",
};

export default function EmailTriageSettings() {
  const [prefs, setPrefs] = useState<TriagePrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newVip, setNewVip] = useState("");
  const [newDismiss, setNewDismiss] = useState("");
  const [newPriorityKw, setNewPriorityKw] = useState("");
  const [newDismissKw, setNewDismissKw] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("email_triage_preferences" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setPrefs({
        vip_senders: (data as any).vip_senders || [],
        dismiss_senders: (data as any).dismiss_senders || [],
        priority_keywords: (data as any).priority_keywords || [],
        dismiss_keywords: (data as any).dismiss_keywords || [],
        custom_instructions: (data as any).custom_instructions || "",
      });
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("email_triage_preferences" as any)
      .upsert({
        user_id: user.id,
        vip_senders: prefs.vip_senders,
        dismiss_senders: prefs.dismiss_senders,
        priority_keywords: prefs.priority_keywords,
        dismiss_keywords: prefs.dismiss_keywords,
        custom_instructions: prefs.custom_instructions,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Your email triage preferences have been updated." });
    }
  };

  const addToList = (key: keyof TriagePrefs, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const list = prefs[key] as string[];
    if (list.includes(value.trim())) return;
    setPrefs({ ...prefs, [key]: [...list, value.trim()] });
    setter("");
  };

  const removeFromList = (key: keyof TriagePrefs, index: number) => {
    const list = [...(prefs[key] as string[])];
    list.splice(index, 1);
    setPrefs({ ...prefs, [key]: list });
  };

  const TagList = ({ items, listKey }: { items: string[]; listKey: keyof TriagePrefs }) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-muted rounded-lg px-2.5 py-1 text-xs font-medium">
          {item}
          <button onClick={() => removeFromList(listKey, i)} className="text-muted-foreground hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );

  if (loading) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-accent" />
        <h2 className="font-display font-semibold">Smart Email Triage</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Teach your agent how to prioritize your emails. These rules are applied every time your inbox is triaged.
      </p>

      {/* VIP Senders */}
      <div className="border rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent" />
          <label className="text-sm font-semibold">VIP Senders</label>
        </div>
        <p className="text-xs text-muted-foreground">Emails from these people/domains are always flagged as high priority. Use email addresses or domains (e.g., boss@company.com or company.com).</p>
        <div className="flex gap-2">
          <Input
            value={newVip}
            onChange={(e) => setNewVip(e.target.value)}
            placeholder="e.g., boss@company.com"
            className="rounded-lg text-sm"
            onKeyDown={(e) => e.key === "Enter" && addToList("vip_senders", newVip, setNewVip)}
          />
          <Button size="sm" variant="outline" onClick={() => addToList("vip_senders", newVip, setNewVip)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <TagList items={prefs.vip_senders} listKey="vip_senders" />
      </div>

      {/* Dismiss Senders */}
      <div className="border rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-muted-foreground" />
          <label className="text-sm font-semibold">Dismissed Senders</label>
        </div>
        <p className="text-xs text-muted-foreground">Emails from these senders are automatically classified as low priority.</p>
        <div className="flex gap-2">
          <Input
            value={newDismiss}
            onChange={(e) => setNewDismiss(e.target.value)}
            placeholder="e.g., noreply@marketing.com"
            className="rounded-lg text-sm"
            onKeyDown={(e) => e.key === "Enter" && addToList("dismiss_senders", newDismiss, setNewDismiss)}
          />
          <Button size="sm" variant="outline" onClick={() => addToList("dismiss_senders", newDismiss, setNewDismiss)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <TagList items={prefs.dismiss_senders} listKey="dismiss_senders" />
      </div>

      {/* Priority Keywords */}
      <div className="border rounded-xl p-4 space-y-2">
        <label className="text-sm font-semibold">🔥 Priority Keywords</label>
        <p className="text-xs text-muted-foreground">Emails containing these words are boosted in priority.</p>
        <div className="flex gap-2">
          <Input
            value={newPriorityKw}
            onChange={(e) => setNewPriorityKw(e.target.value)}
            placeholder='e.g., "deadline", "urgent", "approval"'
            className="rounded-lg text-sm"
            onKeyDown={(e) => e.key === "Enter" && addToList("priority_keywords", newPriorityKw, setNewPriorityKw)}
          />
          <Button size="sm" variant="outline" onClick={() => addToList("priority_keywords", newPriorityKw, setNewPriorityKw)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <TagList items={prefs.priority_keywords} listKey="priority_keywords" />
      </div>

      {/* Dismiss Keywords */}
      <div className="border rounded-xl p-4 space-y-2">
        <label className="text-sm font-semibold">🔇 Dismiss Keywords</label>
        <p className="text-xs text-muted-foreground">Emails containing these words are automatically marked low priority.</p>
        <div className="flex gap-2">
          <Input
            value={newDismissKw}
            onChange={(e) => setNewDismissKw(e.target.value)}
            placeholder='e.g., "unsubscribe", "newsletter", "weekly digest"'
            className="rounded-lg text-sm"
            onKeyDown={(e) => e.key === "Enter" && addToList("dismiss_keywords", newDismissKw, setNewDismissKw)}
          />
          <Button size="sm" variant="outline" onClick={() => addToList("dismiss_keywords", newDismissKw, setNewDismissKw)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <TagList items={prefs.dismiss_keywords} listKey="dismiss_keywords" />
      </div>

      {/* Custom Instructions */}
      <div className="border rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <label className="text-sm font-semibold">Custom Triage Instructions</label>
        </div>
        <p className="text-xs text-muted-foreground">
          Write your own rules in plain English. The AI will follow them when categorizing emails.
        </p>
        <Textarea
          value={prefs.custom_instructions}
          onChange={(e) => setPrefs({ ...prefs, custom_instructions: e.target.value })}
          placeholder={`Examples:\n• Anything from my boss (sarah@company.com) is always urgent\n• Ignore all recruitment/job emails\n• Flag any email mentioning "Project Phoenix"\n• Client emails from @bigcorp.com should always be needs_reply`}
          className="rounded-lg text-sm min-h-[100px]"
        />
      </div>

      <Button onClick={save} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
        {saving ? "Saving…" : "Save Triage Preferences"}
      </Button>
    </section>
  );
}
