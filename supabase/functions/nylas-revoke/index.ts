// Revoke a Nylas grant and delete it from nylas_grants.
// Body: { provider?: string, email?: string }
// Returns: { ok: true }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const provider: string = body.provider || "google";
    const email: string | undefined = body.email;

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the grant(s) to revoke
    let query = admin
      .from("nylas_grants")
      .select("id, grant_id")
      .eq("user_id", user.id)
      .eq("provider", provider);

    if (email) {
      query = query.eq("email", email);
    }

    const { data: grants, error: fetchErr } = await query;
    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch grants", detail: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!grants || grants.length === 0) {
      return new Response(JSON.stringify({ ok: true, revoked: 0, message: "No grants found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let revoked = 0;
    const errors: string[] = [];

    for (const grant of grants) {
      // Delete grant from Nylas
      try {
        const revokeRes = await fetch(
          `${NYLAS_BASE}/v3/grants/${grant.grant_id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${nylasApiKey}` },
          }
        );
        // 404 means already revoked on Nylas side — still delete from DB
        if (!revokeRes.ok && revokeRes.status !== 404) {
          const errText = await revokeRes.text();
          console.warn(`Nylas DELETE grant ${grant.grant_id} returned ${revokeRes.status}: ${errText}`);
          errors.push(`Nylas revoke ${grant.grant_id}: HTTP ${revokeRes.status}`);
        }
      } catch (e: any) {
        console.warn(`Nylas DELETE grant ${grant.grant_id} threw:`, e.message);
        errors.push(`Nylas revoke ${grant.grant_id}: ${e.message}`);
      }

      // Delete from nylas_grants regardless (don't leave orphaned rows)
      await admin.from("nylas_grants").delete().eq("id", grant.id);
      revoked++;
    }

    // Purge all email data for this user so reconnecting a different account
    // starts from a clean slate — no stale emails from the old account.
    // action_items(email_triage) and draft_actions deleted first; non-email_triage
    // action_items have no FK constraint so email_metadata_id is nulled out
    // rather than deleting rows the user may have intentionally kept.
    await Promise.all([
      admin.from("draft_actions").delete().eq("user_id", user.id),
      admin.from("action_items").delete().eq("user_id", user.id).eq("source", "email_triage"),
      admin.from("action_items")
        .update({ email_metadata_id: null })
        .eq("user_id", user.id)
        .neq("source", "email_triage")
        .not("email_metadata_id", "is", null),
    ]);
    await admin.from("email_metadata").delete().eq("user_id", user.id);

    return new Response(
      JSON.stringify({ ok: true, revoked, errors: errors.length ? errors : null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("nylas-revoke error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
