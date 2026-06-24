// Lean voice-optimised system prompt for OpenAI Realtime sessions.
// Every token here is charged on every conversation turn — keep it tight.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const NYLAS_BASE = "https://api.us.nylas.com";

async function fetchEvents(grantId: string, nylasApiKey: string, tz: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const start = Math.floor(Date.now() / 1000);
    const end = start + 7 * 86400; // next 7 days
    const params = new URLSearchParams({ calendar_id: "primary", start: String(start), end: String(end), limit: "10" });
    const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events?${params}`, {
      headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { events: [], needsReauth: res.status === 401 };
    const data = await res.json();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
    const events = (data.data || []).map((ev: any) => ({
      id: ev.id,
      title: ev.title || "(untitled)",
      when: ev.when?.start_time ? fmt.format(new Date(ev.when.start_time * 1000)) : (ev.when?.start_date || ""),
      attendees: (ev.participants || []).map((p: any) => p.name || p.email).slice(0, 3).join(", "),
    }));
    return { events, needsReauth: false };
  } catch {
    return { events: [], needsReauth: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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
    const devMode = body.devMode === true;
    const requestedFirstSession = body.firstSession === true;

    if (devMode) {
      return new Response(JSON.stringify({
        systemPrompt: `You are ${agentName}, a voice assistant. Dev mode — no real data loaded. Reply in 1 sentence.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
      grantRow && nylasApiKey ? fetchEvents(grantRow.grant_id, nylasApiKey, tz) : Promise.resolve({ events: [], needsReauth: false }),
      admin.from("contacts")
        .select("id, name, email, company, is_vip")
        .eq("user_id", user.id)
        .order("is_vip", { ascending: false })
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(20),
      admin.from("email_metadata")
        .select("nylas_message_id, from_name, from_address, subject, category")
        .eq("user_id", user.id)
        .gte("received_at", new Date(Date.now() - 86400_000).toISOString())
        .is("replied_at", null)
        .in("category", ["urgent", "needs_reply"])
        .order("priority_score", { ascending: false })
        .limit(15),
      admin.from("action_items")
        .select("title, priority, due_date")
        .eq("user_id", user.id)
        .in("status", ["open", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10),
      admin.from("user_preferences")
        .select("user_display_name, agent_name, work_context, voice_onboarded")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const now = new Date();
    const today = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(now);
    const timeNow = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
    const displayName = prefsRes.data?.user_display_name || "the user";
    const resolvedAgentName = (prefsRes.data?.agent_name || "").trim() || agentName;
    const workContext = (prefsRes.data?.work_context || "").trim();
    const isFirstSession = requestedFirstSession && !prefsRes.data?.voice_onboarded;

    // Mark onboarded now so repeat fast-reconnects don't re-trigger the greeting.
    if (isFirstSession) {
      admin.from("user_preferences")
        .update({ voice_onboarded: true })
        .eq("user_id", user.id)
        .then(() => {}); // fire-and-forget; don't block the response
    }

    let prompt = `You are ${resolvedAgentName}, voice EA for ${displayName}. Today: ${today}, ${timeNow} (${tz}).${workContext ? `\nCONTEXT: ${workContext}` : ""}

VOICE: 1 sentence default (2 max). No markdown/lists/filler/preamble. Short confirms: "Sent." "Done." Ask 1 question if detail missing.
LANGUAGE: English only.
TURNS: One request at a time. Clarify before acting on ambiguous requests.
ACTIONS (email/calendar/task/contact): Two-step — nothing executes until confirmed.
  Step 1: Call tool → read details aloud in 1-2 sentences → end with "Just say handle it."
  Step 2: User says handle it/confirm/yes/go ahead → call confirm_action. Decline → cancel_action. Wants changes → re-call tool with new args.
  NEVER call confirm_action until user responds to YOUR prompt. Statements like "got it/noted/sounds good" = conversational, not confirmation.
  IDs: use only IDs from lists below. Emails: only from CONTACTS or user-given — never guess.
READ EMAIL: call read_email(messageId) immediately, no confirm. Summarize in 2-3 spoken sentences.
REFRESH: If the user asks about emails, contacts, calendar, or tasks not covered by the lists below — call get_inbox, get_calendar, search_contacts, or get_tasks immediately. No confirm needed.
PRIORITY: Revenue/deals first → VIP relationships → deadlines → ops.
JUDGMENT: One specific recommendation, not options. Draft immediately rather than describing. Evaluate meeting requests concretely (who, what you gain, cost).
MEETING PREP: Use CONTEXT + calendar/contacts below. Be specific — never generic talking points.`;

    prompt += grantRow
      ? `\nAccount: ${grantRow.email}.`
      : `\nNO EMAIL/CALENDAR. For those requests: "Connect Google in Settings first."`;

    const events = (calRes as any).events || [];
    if (events.length > 0) {
      prompt += `\nCAL (7d):\n` + events.map((e: any) =>
        `${e.when}: ${e.title}${e.attendees ? ` (${e.attendees})` : ""} [evt:${e.id}]`).join("\n");
    } else if (grantRow) {
      prompt += `\nCAL: clear for 7d.`;
    }

    const urgent = urgentRes.data || [];
    if (urgent.length > 0) {
      prompt += `\nINBOX:\n` + urgent.map((m: any) =>
        `${m.from_name || m.from_address}: "${m.subject}" [${m.category}] [msg:${m.nylas_message_id}]`).join("\n");
    }

    const tasks = tasksRes.data || [];
    if (tasks.length > 0) {
      prompt += `\nTASKS:\n` + tasks.map((t: any) =>
        `${t.title}${t.due_date ? ` (${t.due_date})` : ""} [${t.priority}]`).join("\n");
    }

    const contacts = contactsRes.data || [];
    if (contacts.length > 0) {
      prompt += `\nCONTACTS:\n` + contacts.map((c: any) =>
        `${c.name}${c.email ? ` <${c.email}>` : ""}${c.company ? `, ${c.company}` : ""}${c.is_vip ? " [VIP]" : ""} [cid:${c.id}]`).join("\n");
    }

    if (isFirstSession) {
      prompt +=
        `\nFIRST_SESSION: At the very start of this conversation, BEFORE the user says anything, speak this EXACT greeting word for word:\n` +
        `"Hi ${displayName}, my name is ${resolvedAgentName}. ` +
        `I'm your administrative assistant for all of your coordination needs. ` +
        `While I'm learning how to do a lot more things to support you, like helping with digital marketing, staffing and book keeping automation, lots of stuff. ` +
        `For now, I'm your 24/7/365 admin, constantly monitoring your emails and calendar and keeping you organized. ` +
        `For anything you need, just come back here and talk to me (or text if you're more comfortable than that). ` +
        `While I'm an advanced AI agent, I'm designed to act just like a human assistant. ` +
        `You don't need to learn any software or navigate any dashboard. Just ask me and I will handle it. ` +
        `Now, the last thing I really need to share before we get started is something pretty cool. ` +
        `I'm the first AI in existence to be trained to understand your unique personality, so I understand how YOU like to communicate and work. ` +
        `If you didn't take the brief personality assessment when you created your account, I'd recommend doing that so I get you, like a human assistant would. ` +
        `That's it! I look forward to helping keep you organized and give you hours back in your week. ` +
        `So, let's get started, how can I help?"`;
    }

    return new Response(JSON.stringify({ systemPrompt: prompt, userId: user.id, tz, isFirstSession }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[voice-session] error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
