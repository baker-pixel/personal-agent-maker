import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper to refresh an expired Google token
export async function refreshGoogleToken(userId: string, provider: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error || !tokenRow) {
    throw new Error("No token found for this provider");
  }

  // Check if token is still valid (millisecond comparison; matches gmail-fetch)
  const expiresAtMs = new Date(tokenRow.token_expires_at).getTime();
  const isExpired = !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs - 60_000;
  if (!isExpired) {
    return tokenRow.access_token;
  }

  // Refresh the token
  if (!tokenRow.refresh_token) {
    throw new Error("RECONNECT_REQUIRED");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    if (data.error === "invalid_grant" || data.error === "unauthorized_client") {
      // Refresh token revoked — drop the row so the user must reconnect.
      await adminClient
        .from("google_oauth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider);
      throw new Error("RECONNECT_REQUIRED");
    }
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: data.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return data.access_token;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// This function can also be called directly to test token refresh
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ message: "This is a helper module" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
