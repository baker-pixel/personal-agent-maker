import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept name/email from request body (user filled in form); fall back to auth metadata
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const firstName = (body.first_name || user.user_metadata?.full_name?.split(" ")[0] || "").trim() || "User";
    const lastName = (body.last_name || "").trim();
    const email = (body.email || user.email || "").trim();

    const apiKey = Deno.env.get("ASSESSMENT_API_KEY") ?? "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Assessment service not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = { email, first_name: firstName, last_name: lastName };
    console.log("[assessment-proxy] calling upstream with email:", user.email);

    const res = await fetch("https://enpmyemnkiaaosaznmdf.supabase.co/functions/v1/assessment-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();
    console.log("[assessment-proxy] upstream status:", res.status, "body:", rawText.slice(0, 500));

    let data: any = null;
    try { data = JSON.parse(rawText); } catch { /* non-JSON body */ }

    if (!res.ok) {
      const errorMsg = data?.error || data?.message || `Upstream ${res.status}`;
      const alreadyDone = errorMsg === "Assessment already completed";
      if (alreadyDone) {
        // Mark as completed in DB so the UI reflects it
        await admin.from("user_preferences").upsert(
          { user_id: user.id, assessment_status: "success", updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      }
      return new Response(JSON.stringify({ error: errorMsg, already_completed: alreadyDone }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-store session_id so we can match it when the user returns
    if (data.session_id) {
      await admin.from("user_preferences").upsert(
        { user_id: user.id, assessment_session_id: data.session_id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[assessment-proxy] error:", err?.message ?? err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
