import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Pull all user SLA preferences in one go
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("user_id, lead_nudge_enabled, lead_nudge_minutes, lead_escalate_drafted_minutes, lead_escalate_to_slack, lead_escalate_to_sms, slack_notification_channel_id, phone_number");

    const prefMap = new Map<string, any>();
    (prefs || []).forEach((p: any) => prefMap.set(p.user_id, p));

    // Find candidate leads (oldest first), filter per-user SLA in code
    const { data: leads, error } = await admin
      .from("leads")
      .select("id, user_id, from_name, from_email, subject, source, status, received_at, nudged_at")
      .in("status", ["new", "drafted"])
      .limit(500);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ ok: true, nudged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    let nudged = 0;

    for (const lead of leads) {
      const p = prefMap.get(lead.user_id) || {};
      if (p.lead_nudge_enabled === false) continue;

      const baseMin = Math.max(1, p.lead_nudge_minutes ?? 15);
      const escalateMin = Math.max(baseMin, p.lead_escalate_drafted_minutes ?? 60);
      const ageMin = (now - new Date(lead.received_at).getTime()) / 60000;

      const neverNudged = !lead.nudged_at;
      const lastNudgeMin = lead.nudged_at ? (now - new Date(lead.nudged_at).getTime()) / 60000 : Infinity;

      // First nudge after baseMin; re-nudge drafted leads after escalateMin since last nudge
      const shouldFirstNudge = neverNudged && ageMin >= baseMin;
      const shouldEscalate = !neverNudged && lead.status === "drafted" && lastNudgeMin >= escalateMin;
      if (!shouldFirstNudge && !shouldEscalate) continue;

      const escalating = shouldEscalate;
      const ageStr = `${Math.round(ageMin)} min`;
      const subjectLine = escalating
        ? `⚠️ Still unanswered (${ageStr}): ${lead.subject || "(no subject)"}`
        : `🔥 Unanswered lead: ${lead.subject || "(no subject)"}`;

      await admin.from("draft_actions").insert({
        user_id: lead.user_id,
        type: "lead_nudge",
        status: "pending",
        to_email: lead.from_email,
        to_name: lead.from_name,
        subject: subjectLine,
        body: `Lead from ${lead.from_name || lead.from_email} via ${lead.source || "unknown source"} arrived ${ageStr} ago and is still ${lead.status}. Open the Leads page to respond.`,
        metadata: { lead_id: lead.id, source: lead.source, escalation: escalating },
      });

      // Optional Slack escalation
      if (escalating && p.lead_escalate_to_slack && p.slack_notification_channel_id) {
        try {
          await admin.functions.invoke("slack-channels", {
            body: {
              action: "send",
              channel: p.slack_notification_channel_id,
              text: `⚠️ Lead from *${lead.from_name || lead.from_email}* still unanswered after ${ageStr}. Subject: ${lead.subject || "(no subject)"}`,
            },
          });
        } catch (_) { /* non-fatal */ }
      }

      // Optional SMS escalation
      if (escalating && p.lead_escalate_to_sms && p.phone_number) {
        try {
          await admin.functions.invoke("sms-send", {
            body: {
              to: p.phone_number,
              message: `Normy: lead from ${lead.from_name || lead.from_email} unanswered ${ageStr}. Subject: ${lead.subject || "(no subject)"}`,
            },
          });
        } catch (_) { /* non-fatal */ }
      }

      await admin.from("leads").update({ nudged_at: new Date().toISOString() }).eq("id", lead.id);
      nudged++;
    }

    return new Response(JSON.stringify({ ok: true, nudged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lead-nudge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
