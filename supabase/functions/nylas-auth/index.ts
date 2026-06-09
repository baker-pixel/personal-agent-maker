// Generate a Nylas OAuth URL for Gmail + Calendar access.
// Body: { service?: string, origin?: string }
// Returns: { url: string }

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
    const origin = (body.origin || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const service: string = body.service ?? "gmail";
    const isPopupFlow: boolean = body.isPopupFlow ?? false;
    const redirectUri = `${origin}/auth/google/callback`;

    const clientId = Deno.env.get("NYLAS_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Encode popup flag in state so GoogleCallback knows the flow type even
    // after COOP headers from Google sever window.opener.
    const state = isPopupFlow ? `${service}|popup` : service;

    // Nylas v3 Connect — only supported params. No Google-native scope/access_type;
    // those trigger ECC fallback routing and return not_found_error.
    const provider = "google"; // Nylas Google grant covers Gmail + Calendar
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      provider,
      state,
    });

    const url = `${NYLAS_BASE}/v3/connect/auth?${params.toString()}`;
    console.log("NYLAS_OAUTH_URL:", url);

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("nylas-auth error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
