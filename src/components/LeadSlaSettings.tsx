import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Clock } from "lucide-react";

type Sla = {
  lead_nudge_enabled: boolean;
  lead_nudge_minutes: number;
  lead_escalate_drafted_minutes: number;
  lead_escalate_to_slack: boolean;
  lead_escalate_to_sms: boolean;
  slack_notification_channel_name: string | null;
  phone_number: string | null;
};

const DEFAULTS: Sla = {
  lead_nudge_enabled: true,
  lead_nudge_minutes: 15,
  lead_escalate_drafted_minutes: 60,
  lead_escalate_to_slack: false,
  lead_escalate_to_sms: false,
  slack_notification_channel_name: null,
  phone_number: null,
};

export function LeadSlaSettings({ onClose }: { onClose?: () => void }) {
  const [sla, setSla] = useState<Sla>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data } = await supabase
        .from("user_preferences")
        .select("lead_nudge_enabled, lead_nudge_minutes, lead_escalate_drafted_minutes, lead_escalate_to_slack, lead_escalate_to_sms, slack_notification_channel_name, phone_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setSla({ ...DEFAULTS, ...data });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        lead_nudge_enabled: sla.lead_nudge_enabled,
        lead_nudge_minutes: Math.max(1, sla.lead_nudge_minutes),
        lead_escalate_drafted_minutes: Math.max(sla.lead_nudge_minutes, sla.lead_escalate_drafted_minutes),
        lead_escalate_to_slack: sla.lead_escalate_to_slack,
        lead_escalate_to_sms: sla.lead_escalate_to_sms,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error("Failed to save SLA");
    toast.success("Lead SLA saved");
    onClose?.();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Lead nudge enabled</p>
            <p className="text-xs text-muted-foreground">Master switch for the unanswered-lead nudge.</p>
          </div>
          <Switch checked={sla.lead_nudge_enabled} onCheckedChange={(v) => setSla({ ...sla, lead_nudge_enabled: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">First nudge after (min)</Label>
            <Input
              type="number"
              min={1}
              value={sla.lead_nudge_minutes}
              onChange={(e) => setSla({ ...sla, lead_nudge_minutes: parseInt(e.target.value) || 15 })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">For status "new" or "drafted".</p>
          </div>
          <div>
            <Label className="text-xs">Escalate drafted after (min)</Label>
            <Input
              type="number"
              min={sla.lead_nudge_minutes}
              value={sla.lead_escalate_drafted_minutes}
              onChange={(e) => setSla({ ...sla, lead_escalate_drafted_minutes: parseInt(e.target.value) || 60 })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Re-nudge if still unsent.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">Escalation channels (on re-nudge)</p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">Send to Slack</p>
            <p className="text-xs text-muted-foreground">
              {sla.slack_notification_channel_name ? `Channel: #${sla.slack_notification_channel_name}` : "No Slack channel configured in Settings."}
            </p>
          </div>
          <Switch
            disabled={!sla.slack_notification_channel_name}
            checked={sla.lead_escalate_to_slack}
            onCheckedChange={(v) => setSla({ ...sla, lead_escalate_to_slack: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">Send SMS</p>
            <p className="text-xs text-muted-foreground">
              {sla.phone_number ? `To: ${sla.phone_number}` : "No phone number configured in Settings."}
            </p>
          </div>
          <Switch
            disabled={!sla.phone_number}
            checked={sla.lead_escalate_to_sms}
            onCheckedChange={(v) => setSla({ ...sla, lead_escalate_to_sms: v })}
          />
        </div>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save SLA
      </Button>
    </div>
  );
}
