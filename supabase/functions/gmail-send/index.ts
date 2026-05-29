import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null }> {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    const { draftId } = await req.json();
    if (!draftId) {
      return new Response(
        JSON.stringify({ error: "draftId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the draft using service role to bypass RLS timing issues
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: draft, error: draftError } = await adminClient
      .from("draft_actions")
      .select("*")
      .eq("id", draftId)
      .eq("user_id", userId)
      .single();

    if (draftError || !draft) {
      return new Response(
        JSON.stringify({ error: "Draft not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (draft.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Draft already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Nylas grant
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    if (!nylasApiKey) {
      return new Response(
        JSON.stringify({ error: "Email sending not configured. Contact support." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    let grantId: string;
    try {
      const grant = await getNylasGrant(adminClient, userId);
      grantId = grant.grantId;
    } catch (tokenError: any) {
      if (tokenError.code === "NOT_CONNECTED") {
        return new Response(
          JSON.stringify({ error: "Gmail not connected", code: "NOT_CONNECTED" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw tokenError;
    }

    // Build and send the email via Nylas
    const toRecipients = (draft.to_email as string)
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean)
      .map((e: string) => ({ email: e }));

    const sendBody: Record<string, any> = {
      subject: draft.subject,
      body: draft.body,
      to: toRecipients,
    };
    if (draft.thread_id) {
      sendBody.reply_to_message_id = draft.in_reply_to || draft.thread_id;
    }

    const sendRes = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nylasApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      if (sendRes.status === 401) {
        return new Response(
          JSON.stringify({
            error: "Your Gmail session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Update draft status to failed
      await adminClient
        .from("draft_actions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", draftId);

      return new Response(
        JSON.stringify({ error: sendData.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sentMsgId = sendData.data?.id || null;

    // Update draft status to sent
    await adminClient
      .from("draft_actions")
      .update({
        status: "sent",
        gmail_message_id: sentMsgId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);

    // Mark the source email as replied in email_metadata
    if (draft.nylas_message_id) {
      await adminClient
        .from("email_metadata")
        .update({ replied_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("nylas_message_id", draft.nylas_message_id);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: sentMsgId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
