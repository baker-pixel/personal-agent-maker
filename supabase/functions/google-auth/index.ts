const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");

    if (!clientId) {
      throw new Error("Missing GOOGLE_CLIENT_ID environment variable");
    }

    const { service, origin } = await req.json();

    // Use the caller's origin to build the redirect URI dynamically
    // This ensures it works from any domain (preview, published, custom)
    const callerOrigin = origin || Deno.env.get("GOOGLE_REDIRECT_URI")?.replace("/auth/google/callback", "");
    if (!callerOrigin) {
      throw new Error("Missing origin in request body and no GOOGLE_REDIRECT_URI fallback");
    }
    const redirectUri = `${callerOrigin}/auth/google/callback`;

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
      // READ-ONLY Drive access. Google enforces this at the token level —
      // any write/delete/trash API call will be rejected by Google. Normy CANNOT
      // delete, move, rename, or modify any file in the user's Drive.
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", service ?? "gmail");

    console.log("Generated auth URL with redirect_uri:", redirectUri);

    return new Response(
      JSON.stringify({ url: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("google-auth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
