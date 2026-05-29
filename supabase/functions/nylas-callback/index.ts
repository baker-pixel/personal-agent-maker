// Exchange Nylas OAuth code for a grant_id and store it in nylas_grants.
// Body: { code: string, provider: string, redirectUrl: string }
// Returns: { ok: true, email: string | null }

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

    const body = await req.json();
    // `provider` here is the service id from state ('gmail' | 'google-calendar')
    // The DB provider is always 'google' for Nylas Google grants.
    const { code, provider: service = "gmail", redirectUrl } = body;

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("NYLAS_CLIENT_ID");
    const clientSecret = Deno.env.get("NYLAS_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Redirect URI must exactly match what nylas-auth sent to Nylas
    const callbackUrl = `${redirectUrl}/auth/google/callback`;

    // Exchange code for grant_id via Nylas token endpoint
    const tokenRes = await fetch(`${NYLAS_BASE}/v3/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Nylas token exchange failed:", errText);
      return new Response(JSON.stringify({ error: "Token exchange failed", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    // Nylas returns: { grant_id, email, provider, ... }
    const grantId: string = tokenData.grant_id;
    // Normalize email: null would break the unique constraint upsert (NULL != NULL in PG)
    const email: string | null = tokenData.email || null;

    if (!grantId) {
      return new Response(JSON.stringify({ error: "No grant_id returned by Nylas" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Delete any stale rows for this user+provider first to avoid duplicate
    // NULL-email rows (PG unique constraint treats NULL != NULL so upsert would
    // insert instead of update when email is null).
    if (!email) {
      await admin
        .from("nylas_grants")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "google")
        .is("email", null);
    }

    // Upsert: if a grant already exists for this user+google+email, replace grant_id
    const { error: upsertErr } = await admin
      .from("nylas_grants")
      .upsert(
        {
          user_id: user.id,
          provider: "google",
          grant_id: grantId,
          email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider,email" }
      );

    if (upsertErr) {
      console.error("nylas_grants upsert failed:", upsertErr);
      return new Response(JSON.stringify({ error: "Failed to store grant", detail: upsertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return shape compatible with GoogleCallback.tsx expectations
    return new Response(JSON.stringify({ success: true, email, provider: service }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("nylas-callback error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
