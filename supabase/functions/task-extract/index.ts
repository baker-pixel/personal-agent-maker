// Calendar task extraction with a 15-minute cache.
// Email tasks are generated inside email-triage (unified pipeline) — this
// function handles upcoming calendar events only, so it can run frequently
// without hammering either Groq or the Nylas API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function getNylasGrant(admin: any, userId: string): Promise<{ grantId: string } | null> {
  const { data } = await admin
    .from("nylas_grants")
    .select("grant_id")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "valid")
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

    // ── 1. Calendar events — cache-first (15-min TTL) ────────────────────────────
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: cachedRows } = await admin
      .from("calendar_events")
      .select("event_id, title, start_time, attendees, description")
      .eq("user_id", user.id)
      .gte("fetched_at", cacheThreshold);

    let calendarEvents: any[];
    const fromCache = !!(cachedRows && cachedRows.length > 0);

    if (fromCache) {
      calendarEvents = cachedRows!.map((r: any) => ({
        id: r.event_id,
        title: r.title,
        start: r.start_time || "",
        attendees: r.attendees || "",
        description: r.description || "",
      }));
    } else {
      // Cache miss — fetch fresh from Nylas then write cache
      const grant = await getNylasGrant(admin, user.id);
      calendarEvents = grant
        ? await fetchUpcomingEvents(grant.grantId, nylasApiKey)
        : [];

      if (calendarEvents.length > 0) {
        // Replace all stale rows for this user atomically-ish
        // (delete-then-insert: acceptable because cache is ephemeral)
        await admin.from("calendar_events").delete().eq("user_id", user.id);
        await admin.from("calendar_events").insert(
          calendarEvents.map((e: any) => ({
            user_id: user.id,
            event_id: e.id,
            title: e.title,
            start_time: e.start || null,
            attendees: e.attendees || null,
            description: e.description || null,
          }))
        );
      }
    }

    // ── 2. Dedup — skip events already in action_items ───────────────────────────
    const { data: existing } = await admin
      .from("action_items")
      .select("meeting_summary")
      .eq("user_id", user.id)
      .not("meeting_summary", "is", null);
    const seenKeys = new Set((existing || []).map((r: any) => r.meeting_summary));

    const newEvents = calendarEvents.filter(
      (e: any) => !seenKeys.has(`calendar:${e.id}`)
    );

    if (!newEvents.length) {
      return new Response(
        JSON.stringify({ suggested: 0, fromCache }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Build AI prompt (calendar only) ───────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const calendarBlock = newEvents.map((e: any, i: number) => {
      const when = e.start
        ? new Date(e.start).toLocaleString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
          })
        : "TBD";
      return `[C${i}] "${e.title}" on ${when}${e.attendees ? ` with ${e.attendees}` : ""}`;
    }).join("\n");

    const prompt = `Today is ${today}. Extract concrete, actionable tasks from these upcoming calendar events.

${calendarBlock}

RULES:
- Generate a PREP task only if the meeting clearly needs preparation (e.g. "Prepare slides for Product Review on Wed").
- Generate a FOLLOW-UP task only if the meeting typically produces follow-up work (e.g. "Send notes after Team Standup on Mon").
- Skip one-on-ones with no context, blocked-time events, and personal appointments.
- Write titles in imperative form: "Prepare demo for investor call".
- For prep tasks, set due_date to the event date. For follow-up tasks, set to the day after.
- If a meeting generates neither a useful prep nor follow-up, omit it entirely.

Return ONLY a JSON array, no markdown:
[{"source_index": number, "title": "...", "due_date": "YYYY-MM-DD or null", "priority": "high|medium|low", "task_type": "prep|followup"}]`;

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
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    let tasks: any[] = [];
    try {
      tasks = JSON.parse(cleaned);
      if (!Array.isArray(tasks)) tasks = [];
    } catch {
      tasks = [];
    }

    if (!tasks.length) {
      return new Response(
        JSON.stringify({ suggested: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Build and insert DB rows ───────────────────────────────────────────────
    const rows = tasks
      .filter((t: any) => t.title && typeof t.source_index === "number")
      .map((t: any) => {
        const e = newEvents[t.source_index];
        if (!e) return null;
        const eventDate = e.start ? e.start.slice(0, 10) : null;
        let dueDate: string | null = t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)
          ? t.due_date
          : eventDate;
        if (t.task_type === "followup" && eventDate && !t.due_date) {
          const d = new Date(eventDate);
          d.setDate(d.getDate() + 1);
          dueDate = d.toISOString().slice(0, 10);
        }
        return {
          user_id: user.id,
          title: String(t.title).slice(0, 200),
          description: `Meeting: "${e.title}"${e.attendees ? ` with ${e.attendees}` : ""}`,
          due_date: dueDate,
          priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
          status: "suggested",
          source: "calendar_event",
          meeting_summary: `calendar:${e.id}`,
          meeting_date: e.start || null,
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      return new Response(
        JSON.stringify({ suggested: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insErr } = await admin.from("action_items").insert(rows);
    if (insErr) {
      console.error("insert error:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ suggested: rows.length, fromCache }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("task-extract error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
