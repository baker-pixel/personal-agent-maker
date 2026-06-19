// Builds the lean, voice-optimized system prompt for a Nova Sonic session.
// Called once per voice session by the voice server with the end-user JWT.
// Deliberately much smaller than chat's context: voice latency is dominated
// by prompt size at session start.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

async function fetchEvents(grantId: string, nylasApiKey: string, days: number, tz: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const start = Math.floor(Date.now() / 1000);
    const end = start + days * 86400;
    const params = new URLSearchParams({ calendar_id: "primary", start: String(start), end: String(end), limit: "25" });
    const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events?${params}`, {
      headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { events: [], needsReauth: res.status === 401 };
    const data = await res.json();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const events = (data.data || []).map((ev: any) => ({
      id: ev.id,
      title: ev.title || "(untitled)",
      when: ev.when?.start_time ? fmt.format(new Date(ev.when.start_time * 1000)) : (ev.when?.start_date || ""),
      attendees: (ev.participants || []).map((p: any) => p.name || p.email).slice(0, 5).join(", "),
    }));
    return { events, needsReauth: false };
  } catch {
    return { events: [], needsReauth: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
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
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tz = (typeof body.tz === "string" && body.tz) || "UTC";
    const agentName = (typeof body.agentName === "string" && body.agentName) || "Normy";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY") ?? "";

    const { data: grantRow } = await admin
      .from("nylas_grants")
      .select("grant_id, email")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .eq("status", "valid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [calRes, contactsRes, urgentRes, tasksRes, prefsRes] = await Promise.all([
      grantRow && nylasApiKey ? fetchEvents(grantRow.grant_id, nylasApiKey, 7, tz) : Promise.resolve({ events: [], needsReauth: false }),
      admin.from("contacts")
        .select("id, name, email, company, is_vip")
        .eq("user_id", user.id)
        .order("is_vip", { ascending: false })
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(20),
      admin.from("email_metadata")
        .select("nylas_message_id, from_name, from_address, subject, category, ai_summary")
        .eq("user_id", user.id)
        .gte("received_at", new Date(Date.now() - 7 * 86400_000).toISOString())
        .is("replied_at", null)
        .in("category", ["urgent", "needs_reply"])
        .order("priority_score", { ascending: false })
        .limit(10),
      admin.from("action_items")
        .select("title, priority, due_date")
        .eq("user_id", user.id)
        .in("status", ["open", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10),
      admin.from("user_preferences")
        .select("user_display_name, agent_name")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const now = new Date();
    const today = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
    const timeNow = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
    const displayName = prefsRes.data?.user_display_name || "";
    // DB is the source of truth for the agent's name — client-sent value is a fallback.
    const resolvedAgentName = (prefsRes.data?.agent_name || "").trim() || agentName;

    let prompt = `You are ${resolvedAgentName}, an executive assistant speaking with ${displayName || "the user"} over voice. Your name is ${resolvedAgentName} — the user chose it for you; when asked your name, say "${resolvedAgentName}", never that you have no name. Today is ${today}, ${timeNow} (${tz}).

VOICE STYLE: You are in a spoken conversation. Default to ONE short sentence; use two only when truly needed. No filler, no preamble, no repeating the user's request back. Never use markdown, lists, or formatting. Confirm actions in a few plain words ("Sent." / "Done, it's on your calendar."). If you need missing details (recipient email, time), ask one short question.

LANGUAGE: Always speak and respond in English only, no matter what language or accent the user uses. Never switch languages mid-conversation.

TURN DISCIPLINE: Handle exactly one request at a time. Let the user finish their full thought before acting — if their request seems incomplete or ambiguous, ask a short clarifying question instead of guessing. After answering, wait for the user's next request.

TOOLS & CONFIRMATION: Every action (email, calendar, task, contact) is two-step and NOTHING happens until the user says confirm. Step 1: call the action tool with the details — this only STAGES it. Read the user the exact details in one or two short sentences (for email: recipient, subject, gist of body) and ask "Say confirm to go ahead." Step 2: when the user says confirm (or yes / go ahead / send it), call confirm_action — that executes it. If they decline, call cancel_action. If they want changes, call the action tool again with revised details. Never claim an action happened before confirm_action returns. Never call confirm_action unless the user explicitly confirmed AFTER you read the details. For update/delete tools use only IDs given below — never invent IDs. Never guess an email address — use only addresses from CONTACTS or ones the user gives you; if unknown, ask.

READING EMAIL: To read or summarize an email's content, call read_email with its messageId from the INBOX list — it executes immediately, no confirmation needed. Summarize the content conversationally in a few sentences; read it word-for-word only if the user asks. You can only open emails that appear in the INBOX list.`;

    if (grantRow) {
      prompt += `\n\nConnected account: ${grantRow.email || "Google"}.`;
    } else {
      prompt += `\n\nNO EMAIL/CALENDAR CONNECTED. For any email or calendar request, say: "Connect your Google account in Settings, then I can do that."`;
    }

    const events = (calRes as any).events || [];
    if (events.length > 0) {
      prompt += `\n\nCALENDAR (next 7 days):\n` + events.map((e: any) =>
        `- ${e.when}: ${e.title}${e.attendees ? ` (with ${e.attendees})` : ""} [eventId: ${e.id}]`).join("\n");
    } else if (grantRow) {
      prompt += `\n\nCALENDAR: nothing scheduled in the next 7 days.`;
    }

    const urgent = urgentRes.data || [];
    if (urgent.length > 0) {
      prompt += `\n\nINBOX NEEDING ATTENTION:\n` + urgent.map((m: any) =>
        `- ${m.from_name || m.from_address}: "${m.subject}" (${m.category})${m.ai_summary ? ` — ${m.ai_summary}` : ""} [messageId: ${m.nylas_message_id}]`).join("\n");
    }

    const tasks = tasksRes.data || [];
    if (tasks.length > 0) {
      prompt += `\n\nOPEN TASKS:\n` + tasks.map((t: any) =>
        `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""} [${t.priority}]`).join("\n");
    }

    const contacts = contactsRes.data || [];
    if (contacts.length > 0) {
      prompt += `\n\nCONTACTS:\n` + contacts.map((c: any) =>
        `- ${c.name}${c.email ? ` <${c.email}>` : ""}${c.company ? `, ${c.company}` : ""}${c.is_vip ? " [VIP]" : ""} [contactId: ${c.id}]`).join("\n");
    }

    return new Response(JSON.stringify({ systemPrompt: prompt, userId: user.id, tz }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[voice-session] error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
