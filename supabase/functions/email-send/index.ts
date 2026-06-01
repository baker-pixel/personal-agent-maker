import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrant(adminClient: any, userId: string) {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email as string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { to, subject, emailBody, cc, bcc, replyToMessageId, threadId } = body;

    if (!to || !subject || !emailBody) {
      return new Response(JSON.stringify({ error: "to, subject, and emailBody are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    if (!nylasApiKey) return new Response(JSON.stringify({ error: "Email sending not configured" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let grantId: string;
    try {
      const grant = await getNylasGrant(adminClient, user.id);
      grantId = grant.grantId;
    } catch (e: any) {
      if (e.code === "NOT_CONNECTED") return new Response(JSON.stringify({ error: "Gmail not connected", code: "NOT_CONNECTED" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw e;
    }

    // Parse recipients — support "Name <email>" or plain email
    const parseRecipients = (raw: string | string[]) => {
      const list = Array.isArray(raw) ? raw : [raw];
      return list.flatMap(r => r.split(",").map(s => s.trim()).filter(Boolean)).map(r => {
        const m = r.match(/^(.+?)\s*<([^>]+)>$/);
        if (m) return { name: m[1].trim(), email: m[2].trim() };
        return { email: r };
      });
    };

    // Fetch user's email signature and append if set
    const { data: prefs } = await adminClient
      .from("user_preferences")
      .select("email_signature")
      .eq("user_id", user.id)
      .maybeSingle();
    const signature = prefs?.email_signature?.trim();
    const fullBody = signature ? `${emailBody}\n\n${signature}` : emailBody;

    const sendPayload: Record<string, any> = {
      subject,
      body: fullBody,
      to: parseRecipients(to),
    };
    if (cc) sendPayload.cc = parseRecipients(cc);
    if (bcc) sendPayload.bcc = parseRecipients(bcc);
    if (replyToMessageId) sendPayload.reply_to_message_id = replyToMessageId;
    if (threadId) sendPayload.reply_to_message_id = replyToMessageId || threadId;

    const sendRes = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(sendPayload),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      if (sendRes.status === 401) return new Response(JSON.stringify({ error: "Gmail session expired. Please reconnect.", code: "RECONNECT_REQUIRED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: sendData.message || "Failed to send email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log to draft_actions as sent (for history/audit)
    const toStr = Array.isArray(to) ? to.join(", ") : to;
    await adminClient.from("draft_actions").insert({
      user_id: user.id,
      type: "email_compose",
      status: "sent",
      to_email: toStr,
      subject,
      body: fullBody,
      gmail_message_id: sendData.data?.id || null,
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, messageId: sendData.data?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("email-send error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
