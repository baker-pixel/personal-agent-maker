// On-demand trigger for the daily briefing job, scoped to the authenticated
// user. Mirrors the multi-user cron dispatcher but runs synchronously for one
// user and returns structured logs that the UI can display.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

type LogEntry = { level: "info" | "warn" | "error"; message: string; at: string };

async function getNylasGrant(adminClient: any, userId: string, logs: LogEntry[]): Promise<{ grantId: string; email: string | null } | null> {
  try {
    const { data: grant, error } = await adminClient
      .from("nylas_grants")
      .select("grant_id, email")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("status", "valid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !grant) {
      logs.push({ level: "warn", message: "No Nylas grant found for user", at: new Date().toISOString() });
      return null;
    }
    logs.push({ level: "info", message: "Found Nylas grant", at: new Date().toISOString() });
    return { grantId: grant.grant_id, email: grant.email };
  } catch (e) {
    logs.push({ level: "error", message: `Nylas grant lookup error: ${(e as Error).message}`, at: new Date().toISOString() });
    return null;
  }
}

// Read emails from email_metadata (already AI-triaged) — no Nylas API call needed
async function fetchEmailsFromDB(admin: any, userId: string): Promise<any[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("email_metadata")
    .select("from_address, from_name, subject, ai_summary, category, priority_score")
    .eq("user_id", userId)
    .gte("received_at", since)
    .order("priority_score", { ascending: false })
    .limit(10);
  return (data || []).map((e: any) => ({
    from: e.from_name ? `${e.from_name} <${e.from_address}>` : e.from_address,
    subject: e.subject || "",
    snippet: e.ai_summary || "",
    category: e.category,
  }));
}

async function fetchEvents(grantId: string, nylasApiKey: string): Promise<any[]> {
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
}

async function generateSummary(apiKey: string, emails: any[], events: any[], overdueItems: any[]): Promise<string> {
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const prompt = `Today is ${dayOfWeek}. Generate a concise daily briefing notification for an executive. Keep it to 3-4 sentences max — punchy, actionable.

Data:
- Unread emails: ${emails.length}${emails.length > 0 ? `. Top senders: ${emails.slice(0, 3).map((e: any) => (e.from || "").split("<")[0].trim()).join(", ")}` : ""}
- Today's meetings: ${events.length}${events.length > 0 ? `. Including: ${events.slice(0, 3).map((e: any) => e.summary).join(", ")}` : ""}
- Overdue tasks: ${overdueItems.length}${overdueItems.length ? `. Including: ${overdueItems.map((t: any) => t.title).join(", ")}` : ""}

Lead with the most important thing. Be specific. End with a recommendation. No markdown.`;

  const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a sharp executive assistant writing a morning notification." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiRes.ok) throw new Error(`AI gateway returned ${aiRes.status}`);
  const aiData = await aiRes.json();
  return aiData.choices?.[0]?.message?.content || "Your daily briefing is ready.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const logs: LogEntry[] = [];
  const log = (level: LogEntry["level"], message: string) =>
    logs.push({ level, message, at: new Date().toISOString() });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Missing auth", logs }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized", logs }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;
    log("info", `Triggered by user ${userId}`);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI gateway not configured");

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];

    const grant = await getNylasGrant(admin, userId, logs);

    const [emails, events] = await Promise.all([
      fetchEmailsFromDB(admin, userId).catch(() => []),
      grant ? fetchEvents(grant.grantId, nylasApiKey).catch(() => []) : Promise.resolve([]),
    ]);
    log("info", `Fetched ${emails.length} email(s), ${events.length} event(s)`);

    const { data: overdueItems } = await admin
      .from("action_items")
      .select("title, due_date, priority")
      .eq("user_id", userId)
      .eq("status", "open")
      .lt("due_date", today)
      .limit(5);
    log("info", `Found ${overdueItems?.length || 0} overdue task(s)`);

    const summary = await generateSummary(GROQ_API_KEY, emails, events, overdueItems || []);
    log("info", "Generated AI summary");

    const urgentCount = (overdueItems?.length || 0) + emails.filter((e: any) =>
      e.subject?.toLowerCase().includes("urgent") || e.subject?.toLowerCase().includes("asap")
    ).length;

    // Upsert today's briefing (replace if already exists)
    await admin.from("daily_briefings").delete().eq("user_id", userId).eq("briefing_date", today);
    const { error: insErr } = await admin.from("daily_briefings").insert({
      user_id: userId,
      briefing_date: today,
      summary,
      email_count: emails.length,
      meeting_count: events.length,
      urgent_items: urgentCount,
    });
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
    log("info", "Briefing saved to database");

    return new Response(
      JSON.stringify({
        ok: true,
        logs,
        briefing: { summary, email_count: emails.length, meeting_count: events.length, urgent_items: urgentCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    log("error", (e as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
