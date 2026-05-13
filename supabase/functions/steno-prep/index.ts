import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(userId: string, provider: string) {
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
  if (error || !tokenRow) throw new Error(`${provider} not connected`);

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60_000)) return tokenRow.access_token;

  if (!tokenRow.refresh_token) throw new Error("Re-authentication required");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error_description || d.error);
  await adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: d.access_token,
      token_expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
  return d.access_token;
}

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const attendeesInput: string[] = Array.isArray(body?.attendees) ? body.attendees : [];
    const topic: string = (body?.topic || "").toString();

    const tokens = attendeesInput
      .flatMap((a: string) => norm(a).split(/[,;\s]+/))
      .filter((t) => t.length >= 2);

    // 1) Find best matching prior steno session by attendee/topic overlap
    const { data: sessions } = await supabase
      .from("steno_sessions")
      .select("id, title, summary, key_points, attendees, topics, session_date, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    let lastMeeting: any = null;
    if (sessions && sessions.length) {
      const scored = sessions.map((s: any) => {
        const hay = norm(
          [s.title, s.summary, ...(s.attendees || []), ...(s.topics || [])].join(" ")
        );
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score += 2;
        if (topic && hay.includes(norm(topic))) score += 3;
        return { s, score };
      });
      scored.sort((a, b) => b.score - a.score);
      lastMeeting = scored[0]?.score > 0 ? scored[0].s : sessions[0]; // fall back to most recent
    }

    // 2) Open action items (Steno-sourced), filtered loosely by tokens if provided
    const { data: openActions } = await supabase
      .from("action_items")
      .select("id, title, description, due_date, priority, assignee, created_at, meeting_summary")
      .neq("status", "done")
      .order("created_at", { ascending: false })
      .limit(50);

    const filteredActions = (openActions || []).filter((a: any) => {
      if (tokens.length === 0) return true;
      const hay = norm([a.title, a.description, a.assignee, a.meeting_summary].join(" "));
      return tokens.some((t) => hay.includes(t));
    });

    // 3) Recent emails from/to attendees (last 7 days)
    let recentEmails: any[] = [];
    let gmailWarning: string | null = null;
    try {
      const gmailToken = await getValidToken(user.id, "gmail");
      const emailish = attendeesInput.filter((a) => /@/.test(a));
      const nameish = attendeesInput.filter((a) => !/@/.test(a) && a.trim().length > 1);
      const parts: string[] = [];
      for (const e of emailish.slice(0, 4)) parts.push(`from:${e} OR to:${e}`);
      for (const n of nameish.slice(0, 3)) parts.push(`from:"${n}" OR "${n}"`);
      const q = parts.length ? `(${parts.join(" OR ")}) newer_than:7d` : "";
      if (q) {
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        const listData = await listRes.json();
        const ids = (listData.messages || []).slice(0, 6);
        recentEmails = await Promise.all(
          ids.map(async (m: any) => {
            const r = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${gmailToken}` } }
            );
            const d = await r.json();
            const headers = d.payload?.headers || [];
            const get = (n: string) =>
              headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
            return {
              subject: get("Subject"),
              from: get("From"),
              date: get("Date"),
              snippet: d.snippet,
            };
          })
        );
      }
    } catch (e) {
      gmailWarning = e instanceof Error ? e.message : "Gmail unavailable";
    }

    return new Response(
      JSON.stringify({
        lastMeeting,
        openActions: filteredActions.slice(0, 10),
        recentEmails,
        gmailWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Prep failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
