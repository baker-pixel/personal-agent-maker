// Cron-triggered daily briefing generator. Loops over all users that have at
// least one Nylas grant connected and generates today's briefing if it
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

const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

async function fetchEmailsForUser(grantId: string, nylasApiKey: string): Promise<any[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const params = new URLSearchParams({ limit: "10", in: "INBOX" });
      const listRes = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
      );
      if (!listRes.ok) return [];
      const listData = await listRes.json();
      const messages: any[] = listData.data || [];
      if (!messages.length) return [];
      return messages.slice(0, 10).map((msg: any) => ({
        from: formatAddress(msg.from || []),
        subject: msg.subject || "",
        snippet: msg.snippet || "",
      }));
    } finally {
      clearTimeout(t);
    }
  } catch {
    return [];
  }
}

async function fetchEventsForUser(grantId: string, nylasApiKey: string): Promise<any[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({
        calendar_id: "primary",
        start: String(Math.floor(now.getTime() / 1000)),
        end: String(Math.floor(endOfDay.getTime() / 1000)),
        limit: "20",
      });
      const r = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
      );
      if (!r.ok) return [];
      const data = await r.json();
      return (data.data || []).map((e: any) => ({
        summary: e.title || "(No title)",
        start: e.when?.start_time
          ? new Date(e.when.start_time * 1000).toISOString()
          : e.when?.date || "",
      }));
    } finally {
      clearTimeout(t);
    }
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

  const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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

  console.log("[daily-briefing-cron] handler invoked, method=", req.method);

  // Require service-role bearer token (sent by pg_cron) — this prevents
  // anyone from triggering briefings for every user from the outside.
  const authHeader = req.headers.get("Authorization") || "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  console.log("[daily-briefing-cron] auth header present:", authHeader.length, "expected length:", expected.length, "match:", authHeader === expected);
  if (authHeader !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized", reason: "auth-mismatch" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().split("T")[0];

  // Find all distinct users who have at least one Nylas grant.
  // (One briefing per user; we pick the most-recently-created grant.)
  const { data: grantRows, error: grantErr } = await admin
    .from("nylas_grants")
    .select("user_id, grant_id, email, created_at")
    .eq("provider", "google")
    .eq("status", "valid")
    .order("created_at", { ascending: false });

  if (grantErr) {
    console.error("nylas_grants query failed:", grantErr);
    return new Response(JSON.stringify({ error: grantErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group by user — keep first row per user (most recent grant, due to ORDER BY)
  const byUser = new Map<string, { grantId: string; email: string | null }>();
  for (const row of grantRows || []) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { grantId: row.grant_id, email: row.email });
    }
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [userId, grant] of byUser.entries()) {
    try {
      // Skip if briefing already exists for today
      const { data: existing } = await admin
        .from("daily_briefings")
        .select("id")
        .eq("user_id", userId)
        .eq("briefing_date", today)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const [emails, events] = await Promise.all([
        fetchEmailsForUser(grant.grantId, nylasApiKey),
        fetchEventsForUser(grant.grantId, nylasApiKey),
      ]);

      // Overdue action items for this user
      const { data: overdueItems } = await admin
        .from("action_items")
        .select("title, due_date, priority")
        .eq("user_id", userId)
        .eq("status", "open")
        .lt("due_date", today)
        .limit(5);

      const summary = await generateSummary(GROQ_API_KEY, emails, events, overdueItems || []);

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
