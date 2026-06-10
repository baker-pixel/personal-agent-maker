import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrant(adminClient: any, userId: string) {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "valid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return grant.grant_id as string;
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grantId = await getNylasGrant(adminClient, user.id);

    const { action, nylas_message_id } = await req.json();
    if (!action || !nylas_message_id) {
      return new Response(JSON.stringify({ error: "action and nylas_message_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "mark_read") {
      // Mark as read in Nylas
      const nylasRes = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/messages/${nylas_message_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ unread: false }),
        }
      );
      // Update DB regardless of Nylas response (Nylas may return 200 or 204)
      await adminClient
        .from("email_metadata")
        .update({ is_unread: false })
        .eq("nylas_message_id", nylas_message_id)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "mark_unread") {
      await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/messages/${nylas_message_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ unread: true }),
        }
      );
      await adminClient
        .from("email_metadata")
        .update({ is_unread: true })
        .eq("nylas_message_id", nylas_message_id)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("email-actions error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
