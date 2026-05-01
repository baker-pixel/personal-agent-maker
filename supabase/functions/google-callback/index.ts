import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const { code, provider, redirectUrl } = await req.json();

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const callbackUrl = `${redirectUrl}/auth/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user email
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const userInfo = await userInfoResponse.json();

    // Use service role to store tokens
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Preserve existing refresh_token if Google didn't return a new one
    // (Google only returns refresh_token on first consent or with prompt=consent)
    const googleProviders = ["gmail", "google-calendar"];

    const { data: existing } = await adminClient
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("email", userInfo.email)
      .maybeSingle();

    const { data: sibling } = await adminClient
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("email", userInfo.email)
      .in("provider", googleProviders.filter((p) => p !== provider))
      .not("refresh_token", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const refreshTokenToStore =
      tokenData.refresh_token ?? sibling?.refresh_token ?? existing?.refresh_token ?? null;

    if (!refreshTokenToStore) {
      console.error("google-callback missing refresh_token for provider:", provider, "email:", userInfo.email);
      return new Response(
        JSON.stringify({ error: "Google did not return an offline token. Please retry the connection and approve access." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A new Google consent can rotate/revoke older refresh tokens for the same
    // Google account. Keep sibling service rows in sync so Gmail and Calendar
    // never diverge into a stale-token state.
    const { error: upsertError } = await adminClient
      .from("google_oauth_tokens")
      .upsert(
        {
          user_id: user.id,
          provider,
          access_token: tokenData.access_token,
          refresh_token: refreshTokenToStore,
          token_expires_at: expiresAt,
          email: userInfo.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,email,provider" }
      );

    if (upsertError) {
      console.error("google-callback upsert error:", upsertError);
      return new Response(
        JSON.stringify({ error: `Token storage failed: ${upsertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const siblingProviders = googleProviders.filter((p) => p !== provider);
    const { error: siblingUpdateError } = await adminClient
      .from("google_oauth_tokens")
      .update({
        refresh_token: refreshTokenToStore,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("email", userInfo.email)
      .in("provider", siblingProviders);

    if (siblingUpdateError) {
      console.error("google-callback sibling refresh_token sync error:", siblingUpdateError);
    }

    return new Response(
      JSON.stringify({ success: true, email: userInfo.email, provider }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("google-callback unhandled error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
