// Cron-triggered daily briefing generator. Loops over all users that have at
// least one Google account connected and generates today's briefing if it
// doesn't already exist. Designed to be invoked by pg_cron once per morning.
//
// Authentication: callers must present the Supabase service-role key as the
// bearer token (pg_cron sends this). Per-user JWTs are not required because
// this function operates server-side over multiple users at once.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshIfNeeded(adminClient: any, tokenRow: any): Promise<string | null> {
  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (data.error) return null;
    await adminClient
      .from("google_oauth_tokens")
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);
    return data.access_token;
  } catch {
    return null;
  }
}

async function fetchEmailsForUser(token: string): Promise<any[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:inbox is:unread`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }
    );
    if (!listRes.ok) { clearTimeout(t); return []; }
    const listData = await listRes.json();
    if (!listData.messages?.length) { clearTimeout(t); return []; }
    const emails = await Promise.all(
      listData.messages.slice(0, 10).map(async (msg: any) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }
        );
        const d = await r.json();
        const headers = d.payload?.headers || [];
        const get = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        return { from: get("From"), subject: get("Subject"), snippet: d.snippet };
      })
    );
    clearTimeout(t);
    return emails;
  } catch {
    return [];
  }
}

async function fetchEventsForUser(token: string): Promise<any[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }
    );
    if (!r.ok) { clearTimeout(t); return []; }
    const data = await r.json();
    clearTimeout(t);
    return (data.items || []).map((e: any) => ({
      summary: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date,
    }));
  } catch {
    return [];
  }
}

async function generateSummary(
  apiKey: string,
  emails: any[],
  events: any[],
  overdueItems: any[],
): Promise<string> {
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const prompt = `Today is ${dayOfWeek}. Generate a concise daily briefing notification for an executive. Keep it to 3-4 sentences max — punchy, actionable, like a real EA would text their boss first thing in the morning.

Data:
- Unread emails: ${emails.length}${emails.length > 0 ? `. Top senders: ${emails.slice(0, 3).map((e: any) => (e.from || "").split("<")[0].trim()).join(", ")}` : ""}
- Today's meetings: ${events.length}${events.length > 0 ? `. Including: ${events.slice(0, 3).map((e: any) => e.summary).join(", ")}` : ""}
- Overdue tasks: ${overdueItems.length}${overdueItems.length ? `. Including: ${overdueItems.map((t: any) => t.title).join(", ")}` : ""}

Rules:
- Lead with the most important thing
- Be specific with numbers and names
- End with what you recommend tackling first
- No markdown, just clean conversational text
- Sound like a trusted chief of staff, not a robot`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "You are a sharp executive assistant writing a morning notification. Be brief and specific." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiRes.ok) {
    if (aiRes.status === 429 || aiRes.status === 402) throw new Error(`ai-${aiRes.status}`);
    throw new Error(`ai-${aiRes.status}`);
  }
  const aiData = await aiRes.json();
  return aiData.choices?.[0]?.message?.content
    || "Your daily briefing is ready. Check your inbox and calendar.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require service-role bearer token (sent by pg_cron) — this prevents
  // anyone from triggering briefings for every user from the outside.
  const authHeader = req.headers.get("Authorization") || "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (authHeader !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().split("T")[0];

  // Find all distinct users who have ANY google token. (One briefing per user;
  // we just need at least one connected account.)
  const { data: tokenRows, error: tokErr } = await admin
    .from("google_oauth_tokens")
    .select("user_id, provider, access_token, refresh_token, token_expires_at, id");

  if (tokErr) {
    console.error("token query failed:", tokErr);
    return new Response(JSON.stringify({ error: tokErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group tokens by user
  const byUser = new Map<string, any[]>();
  (tokenRows || []).forEach((row: any) => {
    const list = byUser.get(row.user_id) || [];
    list.push(row);
    byUser.set(row.user_id, list);
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [userId, rows] of byUser.entries()) {
    try {
      // Skip if briefing already exists for today
      const { data: existing } = await admin
        .from("daily_briefings")
        .select("id")
        .eq("user_id", userId)
        .eq("briefing_date", today)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      // Pull a Gmail token (any account) and a Calendar token if present
      const gmailRow = rows.find((r) => r.provider === "gmail");
      const calRow = rows.find((r) => r.provider === "google-calendar");

      const [gmailToken, calToken] = await Promise.all([
        gmailRow ? refreshIfNeeded(admin, gmailRow) : null,
        calRow ? refreshIfNeeded(admin, calRow) : null,
      ]);

      const [emails, events] = await Promise.all([
        gmailToken ? fetchEmailsForUser(gmailToken) : Promise.resolve([]),
        calToken ? fetchEventsForUser(calToken) : Promise.resolve([]),
      ]);

      // Overdue action items for this user
      const { data: overdueItems } = await admin
        .from("action_items")
        .select("title, due_date, priority")
        .eq("user_id", userId)
        .eq("status", "open")
        .lt("due_date", today)
        .limit(5);

      const summary = await generateSummary(LOVABLE_API_KEY, emails, events, overdueItems || []);

      const urgentCount = (overdueItems?.length || 0) + emails.filter((e: any) =>
        e.subject?.toLowerCase().includes("urgent") || e.subject?.toLowerCase().includes("asap")
      ).length;

      await admin.from("daily_briefings").insert({
        user_id: userId,
        briefing_date: today,
        summary,
        email_count: emails.length,
        meeting_count: events.length,
        urgent_items: urgentCount,
      });
      generated++;
    } catch (e) {
      console.error(`briefing failed for user ${userId}:`, e);
      failed++;
      // If we hit AI rate limits, stop early — no point burning more
      if (e instanceof Error && /ai-(429|402)/.test(e.message)) {
        console.warn("AI gateway saturated — stopping cron run early");
        break;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, generated, skipped, failed, total_users: byUser.size }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
