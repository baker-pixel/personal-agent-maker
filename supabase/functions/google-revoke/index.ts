import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { provider, email } = await req.json();
    if (!provider || !email) {
      return new Response(
        JSON.stringify({ error: "Missing provider or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the token row for this user/provider/email
    const { data: row, error: rowErr } = await admin
      .from("google_oauth_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("email", email)
      .maybeSingle();

    if (rowErr) {
      console.error("token lookup failed", rowErr);
    }

    // Prefer revoking the refresh_token (revokes all derived access tokens).
    // Fall back to access_token if no refresh token is stored.
    const tokenToRevoke = row?.refresh_token || row?.access_token;
    let revoked = false;
    if (tokenToRevoke) {
      try {
        const resp = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );
        revoked = resp.ok;
        if (!resp.ok) {
          const text = await resp.text();
          console.warn("Google revoke non-OK:", resp.status, text);
        }
      } catch (err) {
        console.error("Google revoke fetch failed:", err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, revoked }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("google-revoke error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
