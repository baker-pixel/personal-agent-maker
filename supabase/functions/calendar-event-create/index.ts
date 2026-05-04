import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(userId: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId)
    .eq("provider", "google-calendar")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !tokenRow) {
    const e = new Error("Google Calendar not connected");
    (e as any).code = "NOT_CONNECTED";
    throw e;
  }

  const expiresAtMs = new Date(tokenRow.token_expires_at).getTime();
  const isExpired = !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs - 60_000;
  if (!isExpired) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) {
    const e = new Error("Your Google Calendar session has expired. Please reconnect your account.");
    (e as any).code = "RECONNECT_REQUIRED";
    throw e;
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
      // Drop the revoked row so the user is forced into a fresh consent flow.
      let dq = adminClient
        .from("google_oauth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "google-calendar");
      if (tokenRow.email) dq = dq.eq("email", tokenRow.email);
      await dq;
      const e = new Error("Your Google Calendar session has expired. Please reconnect your account.");
      (e as any).code = "RECONNECT_REQUIRED";
      throw e;
    }
    throw new Error(data.error_description || data.error);
  }

  let updateQuery = adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google-calendar");
  if (tokenRow.email) updateQuery = updateQuery.eq("email", tokenRow.email);
  await updateQuery;

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { summary, description, location, start, end, allDay } = await req.json();
    if (!summary || !start) {
      return new Response(JSON.stringify({ error: "summary and start are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidToken(user.id);

    // Build start/end objects. For all-day, use date (YYYY-MM-DD); for timed, use dateTime.
    const startObj = allDay ? { date: start } : { dateTime: start };
    let endObj;
    if (allDay) {
      // Google all-day end date is exclusive — add a day if no end given
      const endDate = end || (() => {
        const d = new Date(start + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
      endObj = { date: endDate };
    } else {
      // Default duration 1h if no end
      const endIso = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
      endObj = { dateTime: endIso };
    }

    const eventBody: Record<string, unknown> = {
      summary,
      start: startObj,
      end: endObj,
    };
    if (description) eventBody.description = description;
    if (location) eventBody.location = location;

    const calRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );
    const calData = await calRes.json();

    if (calData.error) {
      return new Response(JSON.stringify({ error: calData.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ event: { id: calData.id, htmlLink: calData.htmlLink, summary: calData.summary } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const status = (error as any).code === "RECONNECT_REQUIRED" ? 401 :
                   (error as any).code === "NOT_CONNECTED" ? 404 : 500;
    return new Response(
      JSON.stringify({ error: (error as Error).message, code: (error as any).code || "UNKNOWN" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
