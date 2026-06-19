import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

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

    const { summary, description, location, start, end, allDay, attendees } = await req.json();
    if (!summary || !start) {
      return new Response(JSON.stringify({ error: "summary and start are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grant = await getNylasGrant(adminClient, user.id);
    const grantId = grant.grantId;

    // Build Nylas when object
    let when: Record<string, any>;
    if (allDay) {
      const endDate = end || (() => {
        const d = new Date(start + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
      when = { object: "datespan", start_date: start, end_date: endDate };
    } else {
      const startUnix = Math.floor(new Date(start).getTime() / 1000);
      const endIso = end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
      const endUnix = Math.floor(new Date(endIso).getTime() / 1000);
      when = { object: "timespan", start_time: startUnix, end_time: endUnix };
    }

    const eventBody: Record<string, unknown> = { title: summary, when };
    if (description) eventBody.description = description;
    if (location) eventBody.location = location;

    // Attendees: validate and attach as Nylas participants
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validAttendees: Array<{ email: string; name?: string }> = [];
    if (Array.isArray(attendees)) {
      for (const a of attendees) {
        const email = (typeof a === "string" ? a : a?.email || "").trim().toLowerCase();
        if (email && emailRegex.test(email)) {
          validAttendees.push({ email, ...(a?.name ? { name: a.name } : {}) });
        }
      }
    }

    if (validAttendees.length > 0) {
      eventBody.participants = validAttendees.map((a) => ({
        email: a.email,
        ...(a.name ? { name: a.name } : {}),
        status: "noreply",
      }));
    }

    // notify_participants=true → Nylas tells Google Calendar to send invite emails
    const hasAttendees = validAttendees.length > 0;
    const endpoint = `${NYLAS_BASE}/v3/grants/${grantId}/events?calendar_id=primary${hasAttendees ? "&notify_participants=true" : ""}`;

    const calRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nylasApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });
    const calData = await calRes.json();

    if (!calRes.ok) {
      if (calRes.status === 401) {
        const e = new Error("Your Google Calendar session has expired. Please reconnect your account.");
        (e as any).code = "RECONNECT_REQUIRED";
        throw e;
      }
      return new Response(JSON.stringify({ error: calData.message || calData.error || "Failed to create event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const createdEvent = calData.data;
    return new Response(
      JSON.stringify({
        event: {
          id: createdEvent.id,
          htmlLink: createdEvent.html_link,
          summary: createdEvent.title,
          attendees: validAttendees,
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
