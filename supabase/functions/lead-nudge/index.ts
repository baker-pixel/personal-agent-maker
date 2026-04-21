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

    // Find leads that are 15+ minutes old, still new/drafted, and not yet nudged
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: leads, error } = await admin
      .from("leads")
      .select("id, user_id, from_name, from_email, subject, source, received_at")
      .in("status", ["new", "drafted"])
      .lte("received_at", cutoff)
      .is("nudged_at", null)
      .limit(100);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ ok: true, nudged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let nudged = 0;
    for (const lead of leads) {
      // Mark nudged + create a draft_action of type lead_nudge for the Approval Inbox
      await admin.from("draft_actions").insert({
        user_id: lead.user_id,
        type: "lead_nudge",
        status: "pending",
        to_email: lead.from_email,
        to_name: lead.from_name,
        subject: `🔥 Unanswered lead: ${lead.subject || "(no subject)"}`,
        body: `New lead from ${lead.from_name || lead.from_email} via ${lead.source || "unknown source"} arrived ${Math.round((Date.now() - new Date(lead.received_at).getTime()) / 60000)} minutes ago and hasn't been responded to. Open the Leads page to respond.`,
        metadata: { lead_id: lead.id, source: lead.source },
      });

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
