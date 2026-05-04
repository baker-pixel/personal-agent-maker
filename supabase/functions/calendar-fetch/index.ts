import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROVIDER = "google-calendar";

async function deleteStoredToken(
  adminClient: any,
  userId: string,
  email: string | null
) {
  let q = adminClient
    .from("google_oauth_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("provider", PROVIDER);
  if (email) q = q.eq("email", email);
  const { error } = await q;
  if (error) console.error("Failed to delete invalid Calendar token row:", error);
}

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
  const googleError = data?.error ? String(data.error) : null;
  if (!tokenResponse.ok || googleError) {
    console.error("Calendar token refresh failed:", googleError ?? tokenResponse.status, data?.error_description ?? data);
    if (googleError === "invalid_grant") {
      await deleteStoredToken(adminClient, userId, email);
      throw new Error("RECONNECT_REQUIRED");
    }
    throw new Error("REFRESH_FAILED");
  }

  if (!data.access_token || !data.expires_in) {
    console.error("Calendar token refresh missing access_token/expires_in:", data);
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
    .eq("provider", PROVIDER);
  if (email) updateQuery = updateQuery.eq("email", email);

  const { error: updateError } = await updateQuery;
  if (updateError) {
    console.error("Failed to update refreshed Calendar token:", updateError);
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
    .eq("provider", PROVIDER)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("DB fetch error:", fetchError);
    throw new Error("DB_FETCH_FAILED");
  }
  if (!tokenRow) throw new Error("NOT_CONNECTED");
  if (!tokenRow.refresh_token) {
    await deleteStoredToken(adminClient, userId, tokenRow.email);
    throw new Error("RECONNECT_REQUIRED");
  }

  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  const isExpired = !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 60_000;

  if (isExpired) {
    const newAccessToken = await refreshAccessToken(
      adminClient,
      userId,
      tokenRow.refresh_token,
      tokenRow.email
    );
    return { accessToken: newAccessToken, email: tokenRow.email, refreshToken: tokenRow.refresh_token };
  }

  return { accessToken: tokenRow.access_token, email: tokenRow.email, refreshToken: tokenRow.refresh_token };
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
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let tokenContext: { accessToken: string; email: string | null; refreshToken: string };
    try {
      tokenContext = await getValidAccessToken(adminClient, user.id);
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
    let accessToken = tokenContext.accessToken;

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;

    let calRes = await fetch(calUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (calRes.status === 401) {
      console.warn("Calendar fetch returned 401 — refreshing token once and retrying");
      try {
        accessToken = await refreshAccessToken(
          adminClient,
          user.id,
          tokenContext.refreshToken,
          tokenContext.email
        );
        calRes = await fetch(calUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch (refreshError: any) {
        return new Response(
          JSON.stringify({
            error: "Your Google Calendar session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!calRes.ok) {
      const errorText = await calRes.text();
      console.error("Calendar fetch failed:", calRes.status, errorText);

      // 403 typically means missing/denied scope — force a reconnect
      if (calRes.status === 403) {
        let parsed: any = null;
        try { parsed = JSON.parse(errorText); } catch { /* ignore */ }
        return new Response(
          JSON.stringify({
            error: "Calendar access was denied. Please reconnect your account and grant calendar permissions.",
            code: "RECONNECT_REQUIRED",
            context: parsed ?? errorText,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to fetch Calendar events", code: "CALENDAR_API_ERROR" }),
        { status: calRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calData = await calRes.json();

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
