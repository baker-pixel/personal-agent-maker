// Smart task extraction from email_metadata (already AI-triaged) + upcoming
// calendar events. Reads from DB — no extra Nylas email API calls.
// Inserts rows with status='suggested' for user review in the Tasks page.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrant(admin: any, userId: string): Promise<{ grantId: string } | null> {
  const { data } = await admin
    .from("nylas_grants")
    .select("grant_id")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { grantId: data.grant_id } : null;
}

async function fetchUpcomingEvents(grantId: string, nylasApiKey: string): Promise<any[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const weekAhead = now + 7 * 24 * 60 * 60;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const params = new URLSearchParams({
        calendar_id: "primary",
        start: String(now),
        end: String(weekAhead),
        limit: "20",
      });
      const r = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
      );
      if (!r.ok) return [];
      const data = await r.json();
      return (data.data || [])
        .filter((e: any) => e.title && e.title !== "")
        .map((e: any) => ({
          id: e.id,
          title: e.title || "(No title)",
          start: e.when?.start_time
            ? new Date(e.when.start_time * 1000).toISOString()
            : e.when?.date || "",
          attendees: (e.participants || [])
            .map((p: any) => p.name || p.email)
            .filter(Boolean)
            .slice(0, 5)
            .join(", "),
          description: (e.description || "").slice(0, 200),
        }));
    } finally {
      clearTimeout(t);
    }
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const groqApiKey = Deno.env.get("GROQ_API_KEY")!;

    // ── 1. Pull already-triaged urgent/needs_reply emails from DB (last 7 days) ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: emailRows } = await admin
      .from("email_metadata")
      .select("nylas_message_id, from_address, from_name, subject, ai_summary, ai_reason, category, priority_score, received_at")
      .eq("user_id", user.id)
      .in("category", ["urgent", "needs_reply"])
      .gte("received_at", sevenDaysAgo)
      .order("priority_score", { ascending: false })
      .limit(20);

    // ── 2. Fetch upcoming calendar events ────────────────────────────────────────
    const grant = await getNylasGrant(admin, user.id);
    const calendarEvents = grant
      ? await fetchUpcomingEvents(grant.grantId, nylasApiKey)
      : [];

    // ── 3. Dedup — skip anything already suggested/created ────────────────────────
    const { data: existing } = await admin
      .from("action_items")
      .select("meeting_summary")
      .eq("user_id", user.id)
      .in("source", ["email_metadata", "calendar_event", "ai_email_extract"]);
    const seenKeys = new Set((existing || []).map((r: any) => r.meeting_summary));

    const newEmails = (emailRows || []).filter(
      (e: any) => !seenKeys.has(`email:${e.nylas_message_id}`)
    );
    const newEvents = calendarEvents.filter(
      (e: any) => !seenKeys.has(`calendar:${e.id}`)
    );

    if (!newEmails.length && !newEvents.length) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Build AI prompt ────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    const emailBlock = newEmails.length > 0
      ? `## EMAILS REQUIRING ACTION\n${newEmails.map((e: any, i: number) => {
          const from = e.from_name ? `${e.from_name} <${e.from_address}>` : e.from_address;
          return `[E${i}] From: ${from} | Subject: ${e.subject}\nSummary: ${e.ai_summary || e.ai_reason || "(no summary)"}`;
        }).join("\n\n")}`
      : "";

    const calendarBlock = newEvents.length > 0
      ? `## UPCOMING CALENDAR EVENTS\n${newEvents.map((e: any, i: number) => {
          const when = e.start ? new Date(e.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
          return `[C${i}] "${e.title}" on ${when}${e.attendees ? ` with ${e.attendees}` : ""}`;
        }).join("\n")}`
      : "";

    const prompt = `Today is ${today}. Extract concrete, actionable tasks the user needs to do from the following data.

${emailBlock}

${calendarBlock}

RULES:
- From emails: extract EXPLICIT tasks the user must act on (reply, review, send, sign, approve, decide, schedule). Skip FYI-only or newsletters.
- From calendar events: generate a PREP task if the meeting needs preparation (e.g. "Prepare slides for Product Review on Wed"), and a FOLLOW-UP task if it likely produces follow-up work (e.g. "Send meeting notes after Team Standup on Mon"). Only generate these if they make sense — skip one-on-ones with no context, blocked-time events, personal appointments.
- Be specific and actionable. Write titles in imperative form: "Send Q3 report to Sarah", "Prepare demo for investor call".
- Set due_date if there's a clear deadline or the event has a date.
- Skip tasks already obvious from the summary (don't duplicate).

Return ONLY a JSON array, no markdown:
[{"source_type": "email"|"calendar", "source_index": number, "title": "...", "due_date": "YYYY-MM-DD or null", "priority": "high|medium|low"}]`;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI error:", aiRes.status, await aiRes.text());
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "[]";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let tasks: any[] = [];
    try {
      tasks = JSON.parse(cleaned);
      if (!Array.isArray(tasks)) tasks = [];
    } catch {
      tasks = [];
    }

    if (!tasks.length) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Build DB rows ──────────────────────────────────────────────────────────
    const rows = tasks
      .filter((t: any) => t.title && (t.source_type === "email" || t.source_type === "calendar"))
      .map((t: any): any | null => {
        const isEmail = t.source_type === "email";
        const idx = Number(t.source_index);

        if (isEmail) {
          const e = newEmails[idx];
          if (!e) return null;
          const from = e.from_name ? `${e.from_name} <${e.from_address}>` : e.from_address;
          return {
            user_id: user.id,
            title: String(t.title).slice(0, 200),
            description: `From email: "${e.subject}"`,
            due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
            priority: ["high","medium","low"].includes(t.priority) ? t.priority : "medium",
            status: "suggested",
            source: "email_metadata",
            meeting_summary: `email:${e.nylas_message_id}`,
            meeting_date: null,
          };
        } else {
          const e = newEvents[idx];
          if (!e) return null;
          const eventDate = e.start ? e.start.slice(0, 10) : null;
          return {
            user_id: user.id,
            title: String(t.title).slice(0, 200),
            description: `Meeting: "${e.title}"${e.attendees ? ` with ${e.attendees}` : ""}`,
            due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)
              ? t.due_date
              : eventDate,
            priority: ["high","medium","low"].includes(t.priority) ? t.priority : "medium",
            status: "suggested",
            source: "calendar_event",
            meeting_summary: `calendar:${e.id}`,
            meeting_date: e.start ? e.start : null,
          };
        }
      })
      .filter(Boolean);

    if (!rows.length) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin.from("action_items").insert(rows);
    if (insErr) {
      console.error("insert error:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggested: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("task-extract error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
