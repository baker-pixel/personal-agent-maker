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

    // Per-service scopes. Keep Gmail and Calendar flows SEPARATE so Google
    // pre-checks the consent boxes (an empty/merged scope list shows them
    // unchecked, and users who click Continue silently grant nothing).
    const baseScopes = ["openid", "email", "profile"];
    const serviceScopes: Record<string, string[]> = {
      gmail: [],
      "google-calendar": [
        "https://www.googleapis.com/auth/calendar",
      ],
    };
    const requested = serviceScopes[service ?? "gmail"] ?? serviceScopes.gmail;
    const scopes = [...baseScopes, ...requested].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    // Intentionally NOT setting include_granted_scopes — each service must get
    // a clean, independent OAuth flow so scope grants never silently merge
    // across Gmail and Calendar.
    authUrl.searchParams.set("state", service ?? "gmail");

    console.log("Generated auth URL with redirect_uri:", redirectUri);

    return new Response(
      JSON.stringify({ url: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("google-auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
