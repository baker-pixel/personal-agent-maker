// On-demand trigger for the daily briefing job, scoped to the authenticated
// user. Mirrors the multi-user cron dispatcher but runs synchronously for one
// user and returns structured logs that the UI can display.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LogEntry = { level: "info" | "warn" | "error"; message: string; at: string };

async function refreshIfNeeded(adminClient: any, tokenRow: any, logs: LogEntry[]): Promise<string | null> {
  const expiresAt = tokenRow.token_expires_at ? new Date(tokenRow.token_expires_at) : new Date(0);
  if (expiresAt > new Date(Date.now() + 60000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) {
    logs.push({ level: "warn", message: `No refresh token for ${tokenRow.provider}; skipping`, at: new Date().toISOString() });
    return null;
  }
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
    if (data.error) {
      logs.push({ level: "error", message: `Token refresh failed (${tokenRow.provider}): ${data.error}`, at: new Date().toISOString() });
      return null;
    }
    await adminClient
      .from("google_oauth_tokens")
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);
    logs.push({ level: "info", message: `Refreshed ${tokenRow.provider} token`, at: new Date().toISOString() });
    return data.access_token;
  } catch (e) {
    logs.push({ level: "error", message: `Token refresh error: ${(e as Error).message}`, at: new Date().toISOString() });
    return null;
  }
}

async function fetchEmails(token: string): Promise<any[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:inbox is:unread`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json();
    if (!listData.messages?.length) return [];
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
    return emails;
  } finally {
    clearTimeout(t);
  }
}

async function fetchEvents(token: string): Promise<any[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
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
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).map((e: any) => ({
      summary: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date,
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

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: tokenRows, error: tokErr } = await admin
      .from("google_oauth_tokens")
      .select("user_id, provider, access_token, refresh_token, token_expires_at, id")
      .eq("user_id", userId);
    if (tokErr) throw new Error(`Token query failed: ${tokErr.message}`);

    log("info", `Found ${tokenRows?.length || 0} connected Google account(s)`);

    const gmailRow = (tokenRows || []).find((r: any) => r.provider === "gmail");
    const calRow = (tokenRows || []).find((r: any) => r.provider === "google-calendar");

    const [gmailToken, calToken] = await Promise.all([
      gmailRow ? refreshIfNeeded(admin, gmailRow, logs) : null,
      calRow ? refreshIfNeeded(admin, calRow, logs) : null,
    ]);

    const [emails, events] = await Promise.all([
      gmailToken ? fetchEmails(gmailToken).catch(() => []) : Promise.resolve([]),
      calToken ? fetchEvents(calToken).catch(() => []) : Promise.resolve([]),
    ]);
    log("info", `Fetched ${emails.length} unread email(s), ${events.length} event(s)`);

    const { data: overdueItems } = await admin
      .from("action_items")
      .select("title, due_date, priority")
      .eq("user_id", userId)
      .eq("status", "open")
      .lt("due_date", today)
      .limit(5);
    log("info", `Found ${overdueItems?.length || 0} overdue task(s)`);

    const summary = await generateSummary(LOVABLE_API_KEY, emails, events, overdueItems || []);
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
