import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(
  adminClient: any,
  userId: string,
  refreshToken: string,
  email: string | null
): Promise<string> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await tokenResponse.json();
  if (!tokenResponse.ok || data.error) {
    console.error("Token refresh failed:", data);
    throw new Error("REFRESH_FAILED");
  }

  const newAccessToken = data.access_token as string;
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  let updateQuery = adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: newAccessToken,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google-calendar");

  if (email) updateQuery = updateQuery.eq("email", email);

  const { error: updateError } = await updateQuery;
  if (updateError) {
    console.error("Failed to update refreshed token:", updateError);
    throw new Error("DB_UPDATE_FAILED");
  }

  console.log("Calendar access token refreshed for user:", userId);
  return newAccessToken;
}

async function getValidAccessToken(adminClient: any, userId: string) {
  const { data: tokenRow, error: fetchError } = await adminClient
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId)
    .eq("provider", "google-calendar")
    .maybeSingle();

  if (fetchError) {
    console.error("DB fetch error:", fetchError);
    throw new Error("DB_FETCH_FAILED");
  }
  if (!tokenRow) {
    console.error("No Calendar token row found for user:", userId);
    throw new Error("NOT_CONNECTED");
  }
  if (!tokenRow.refresh_token) {
    console.error("No refresh_token stored — user must reconnect");
    throw new Error("RECONNECT_REQUIRED");
  }

  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  const isExpired = Date.now() >= expiresAt - 60_000;

  if (isExpired) {
    console.log("Calendar access token expired — refreshing...");
    const newAccessToken = await refreshAccessToken(
      adminClient,
      userId,
      tokenRow.refresh_token,
      tokenRow.email
    );
    return { accessToken: newAccessToken, email: tokenRow.email };
  }

  return { accessToken: tokenRow.access_token, email: tokenRow.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    try {
      const result = await getValidAccessToken(adminClient, user.id);
      accessToken = result.accessToken;
    } catch (tokenError: any) {
      if (tokenError.message === "NOT_CONNECTED") {
        return new Response(
          JSON.stringify({ error: "Google Calendar not connected", code: "NOT_CONNECTED" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (tokenError.message === "RECONNECT_REQUIRED" || tokenError.message === "REFRESH_FAILED") {
        return new Response(
          JSON.stringify({
            error: "Your Google Calendar session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw tokenError;
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (calRes.status === 401) {
      return new Response(
        JSON.stringify({
          error: "Your Google Calendar session has expired. Please reconnect your account.",
          code: "RECONNECT_REQUIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calData = await calRes.json();

    if (calData.error) {
      return new Response(
        JSON.stringify({ error: calData.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = (calData.items || []).map((event: any) => ({
      id: event.id,
      summary: event.summary || "(No title)",
      description: event.description || "",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location || "",
      attendees: (event.attendees || []).map((a: any) => ({
        email: a.email,
        responseStatus: a.responseStatus,
        displayName: a.displayName,
      })),
      status: event.status,
      htmlLink: event.htmlLink,
    }));

    return new Response(
      JSON.stringify({ events }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("calendar-fetch fatal error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
