import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function participantStatus(status: string): string {
  const m: Record<string, string> = { yes: "accepted", no: "declined", maybe: "tentative", noreply: "needsAction" };
  return m[status] ?? "needsAction";
}

async function nylasFetch(url: string, headers: Record<string, string>, retries = 2): Promise<Response> {
  const res = await fetch(url, { headers });
  if (!res.ok && retries > 0 && res.status >= 500) {
    await new Promise(r => setTimeout(r, 800));
    return nylasFetch(url, headers, retries - 1);
  }
  return res;
}

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null }> {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "valid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Warm-up ping: lets the frontend boot this isolate ahead of real use so
  // the first user action doesn't pay the cold-start cost.
  if (req.method === "GET" && new URL(req.url).searchParams.has("warmup")) {
    return new Response("ok", { headers: corsHeaders });
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

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    let grantId: string;
    try {
      const grant = await getNylasGrant(adminClient, user.id);
      grantId = grant.grantId;
    } catch (tokenError: any) {
      if (tokenError.code === "NOT_CONNECTED") {
        return new Response(
          JSON.stringify({ error: "Google Calendar not connected", code: "NOT_CONNECTED" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw tokenError;
    }

    // Parse caller's IANA timezone so we anchor on local midnight, not UTC midnight.
    // Without this, IST users (UTC+5:30) miss the first 5.5 hours of each day.
    let timezone = "UTC";
    try {
      const body = await req.json();
      if (typeof body?.timezone === "string") timezone = body.timezone;
    } catch { /* no body is fine */ }

    // Local midnight = current UTC time minus elapsed seconds since local midnight.
    function startOfLocalDayUnix(tz: string): number {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
      const elapsed = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
      return Math.floor((now.getTime() - elapsed * 1000) / 1000);
    }

    const startUnix = startOfLocalDayUnix(timezone);
    const endUnix = startUnix + 60 * 24 * 60 * 60; // 60 days covers 2 calendar months

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(startUnix),
      end: String(endUnix),
      limit: "100",
    });

    const calRes = await nylasFetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { Authorization: `Bearer ${nylasApiKey}` }
    );

    if (!calRes.ok) {
      const errorText = await calRes.text();
      console.error("Calendar fetch failed:", calRes.status, errorText);

      // 401 / 400 / 404 — token expired, revoked, or grant deleted; user must reconnect
      if (calRes.status === 401 || calRes.status === 400 || calRes.status === 404) {
        return new Response(
          JSON.stringify({
            error: "Your Google Calendar session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 403 — permission denied (calendar scope not granted)
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

      // 429 — Nylas rate limit
      if (calRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Calendar API rate limit reached. Please try again in a moment.", code: "RATE_LIMITED" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Everything else — log detail, return generic
      return new Response(
        JSON.stringify({
          error: "Could not load calendar events. Please try again.",
          code: "CALENDAR_API_ERROR",
          status: calRes.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calData = await calRes.json();

    const events = (calData.data || []).map((event: any) => {
      const when = event.when || {};
      let start: string | undefined;
      let end: string | undefined;
      if (when.object === "timespan") {
        start = unixToIso(when.start_time);
        end = unixToIso(when.end_time);
      } else if (when.object === "date") {
        start = when.date;
        end = when.end_date || when.date;
      } else if (when.object === "datespan") {
        start = when.start_date;
        end = when.end_date;
      }

      return {
        id: event.id,
        summary: event.title || "(No title)",
        description: event.description || "",
        start,
        end,
        location: event.location || "",
        attendees: (event.participants || []).map((a: any) => ({
          email: a.email,
          responseStatus: participantStatus(a.status || "noreply"),
          displayName: a.name,
        })),
        status: event.status,
        htmlLink: event.html_link,
      };
    });

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
