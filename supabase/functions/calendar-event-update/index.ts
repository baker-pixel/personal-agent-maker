import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { eventId, summary, description, location, start, end, allDay, attendees, notifyAttendees = true } = await req.json();
    if (!eventId) {
      return new Response(JSON.stringify({ error: "eventId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const { grantId } = await getNylasGrant(adminClient, user.id);

    const body: Record<string, unknown> = {};
    if (summary !== undefined) body.title = summary;
    if (description !== undefined) body.description = description;
    if (location !== undefined) body.location = location;

    if (start !== undefined) {
      if (allDay) {
        const endDate = end || (() => {
          const d = new Date(start + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        body.when = { object: "datespan", start_date: start, end_date: endDate };
      } else {
        const startUnix = Math.floor(new Date(start).getTime() / 1000);
        const endIso = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        const endUnix = Math.floor(new Date(endIso).getTime() / 1000);
        body.when = { object: "timespan", start_time: startUnix, end_time: endUnix };
      }
    }

    if (Array.isArray(attendees)) {
      const validAttendees: Array<{ email: string; name?: string }> = [];
      for (const a of attendees) {
        const email = (typeof a === "string" ? a : a?.email || "").trim().toLowerCase();
        if (email && email.includes("@")) {
          validAttendees.push({ email, ...(a?.name ? { name: a.name } : {}) });
        }
      }
      if (validAttendees.length > 0) {
        body.participants = validAttendees.map((a) => ({
          email: a.email,
          ...(a.name ? { name: a.name } : {}),
          status: "noreply",
        }));
      }
    }

    if (Object.keys(body).length === 0) {
      return new Response(JSON.stringify({ error: "No fields to update" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notify = notifyAttendees ? "true" : "false";
    const res = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events/${eventId}?calendar_id=primary&notify_participants=${notify}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${nylasApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const resData = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(
          new Error("Your Google Calendar session has expired. Please reconnect your account."),
          { code: "RECONNECT_REQUIRED" }
        );
      }
      if (res.status === 404) {
        return new Response(JSON.stringify({ error: "Event not found — it may have been deleted." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: resData.message || resData.error || `Failed to update event (${res.status})` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updated = resData.data;
    return new Response(
      JSON.stringify({
        event: {
          id: updated?.id,
          htmlLink: updated?.html_link,
          summary: updated?.title,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const status = error.code === "RECONNECT_REQUIRED" ? 401 :
                   error.code === "NOT_CONNECTED" ? 404 : 500;
    return new Response(
      JSON.stringify({ error: error.message, code: error.code || "UNKNOWN" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
