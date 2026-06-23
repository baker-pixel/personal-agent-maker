import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


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
  const corsHeaders = getCorsHeaders(req);
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

    const { eventId, notifyAttendees = true, message } = await req.json();
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

    // If a cancellation message was provided, patch the event description first
    // so it appears in the attendee notification email
    if (message && notifyAttendees) {
      await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/events/${eventId}?calendar_id=primary`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${nylasApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description: message }),
        }
      );
    }

    const notify = notifyAttendees ? "true" : "false";
    const res = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events/${eventId}?calendar_id=primary&notify_participants=${notify}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      }
    );

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error("Calendar session expired. Please reconnect."), { code: "RECONNECT_REQUIRED" });
      }
      if (res.status === 404) {
        return new Response(JSON.stringify({ error: "Event not found — it may have already been deleted." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const body = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Failed to delete event (${res.status})`, detail: body }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, eventId, notifiedAttendees: notifyAttendees }),
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
