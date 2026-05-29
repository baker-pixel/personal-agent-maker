import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function participantStatus(status: string): string {
  const m: Record<string, string> = { yes: "accepted", no: "declined", maybe: "tentative", noreply: "needsAction" };
  return m[status] ?? "needsAction";
}

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null }> {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email };
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

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(Math.floor(now.getTime() / 1000)),
      end: String(Math.floor(nextWeek.getTime() / 1000)),
      limit: "20",
    });

    const calRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
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

    if (!calRes.ok) {
      const errorText = await calRes.text();
      console.error("Calendar fetch failed:", calRes.status, errorText);

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
