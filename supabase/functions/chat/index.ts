import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function participantStatus(status: string): string {
  const m: Record<string, string> = { yes: "accepted", no: "declined", maybe: "tentative", noreply: "needsAction" };
  return m[status] ?? "needsAction";
}

// --- Nylas grant helpers ---
async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null } | null> {
  try {
    const { data: grant, error } = await adminClient
      .from("nylas_grants")
      .select("grant_id, email")
      .eq("user_id", userId)
      .eq("provider", "google")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !grant) return null;
    return { grantId: grant.grant_id, email: grant.email };
  } catch {
    return null;
  }
}

// Get ALL Nylas grants for a user (multi-account support)
async function getAllNylasGrants(adminClient: any, userId: string): Promise<{ grantId: string; email: string }[]> {
  const { data: rows, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google");
  if (error) {
    console.error("[chat] getAllNylasGrants error:", error.message ?? error);
    return [];
  }
  if (!rows?.length) return [];
  return rows.map((r: any) => ({ grantId: r.grant_id, email: r.email || "primary" }));
}

// --- Gmail fetch with timeout ---
async function fetchRecentEmails(grantId: string, nylasApiKey: string, maxResults = 30, accountLabel = "") {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    const receivedAfter = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000);
    const params = new URLSearchParams({
      limit: String(maxResults),
      in: "INBOX",
      received_after: String(receivedAfter),
    });
    const listRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
    );
    if (!listRes.ok) {
      clearTimeout(timeoutId);
      const needsReauth = listRes.status === 401 || listRes.status === 403;
      return {
        emails: [],
        error: needsReauth
          ? `authentication expired (HTTP ${listRes.status}) — user needs to reconnect this account`
          : `email service temporarily unavailable (${listRes.status})`,
        needsReauth,
        account: accountLabel,
      };
    }
    const listData = await listRes.json();
    clearTimeout(timeoutId);
    const messages: any[] = listData.data || [];
    if (!messages.length) return { emails: [], error: null, needsReauth: false, account: accountLabel };

    const emails = messages.slice(0, maxResults).map((msg: any) => ({
      id: msg.id,
      from: formatAddress(msg.from || []),
      subject: msg.subject || "",
      date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
      snippet: msg.snippet || "",
      isUnread: msg.unread === true,
      account: accountLabel,
    }));
    return { emails, error: null, needsReauth: false, account: accountLabel };
  } catch (e) {
    console.error("Nylas fetch error or timeout:", e);
    return { emails: [], error: e instanceof Error ? e.message : "fetch failed", needsReauth: false, account: accountLabel };
  }
}

// --- Calendar fetch (multi-day for conflict detection) ---
async function fetchEvents(grantId: string, nylasApiKey: string, days = 7) {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 6000);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(Math.floor(now.getTime() / 1000)),
      end: String(Math.floor(endDate.getTime() / 1000)),
      limit: "50",
    });

    const calRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
    );
    if (!calRes.ok) {
      clearTimeout(timeoutId);
      const needsReauth = calRes.status === 401 || calRes.status === 403;
      return {
        events: [],
        error: needsReauth
          ? `authentication expired (HTTP ${calRes.status}) — user needs to reconnect calendar`
          : `calendar service temporarily unavailable (${calRes.status})`,
        needsReauth,
      };
    }
    const calData = await calRes.json();
    clearTimeout(timeoutId);
    if (calData.error) return { events: [], error: calData.error.message || "calendar error", needsReauth: false };

    const events = (calData.data || []).map((event: any) => {
      const when = event.when || {};
      let start: string | undefined;
      let end: string | undefined;
      if (when.object === "timespan") {
        start = unixToIso(when.start_time);
        end = unixToIso(when.end_time);
      } else if (when.object === "date") {
        start = when.date;
        end = when.end_date || when.date;
      } else if (when.object === "datespan") {
        start = when.start_date;
        end = when.end_date;
      }
      return {
        id: event.id || "",
        summary: event.title || "(No title)",
        start,
        end,
        attendees: (event.participants || []).map((a: any) => ({
          name: a.name || a.email,
          email: a.email,
          status: participantStatus(a.status || "noreply"),
        })),
        location: event.location || "",
        conferenceLink: event.conferencing?.details?.url || "",
      };
    });
    return { events, error: null, needsReauth: false };
  } catch (e) {
    console.error("Calendar fetch error or timeout:", e);
    return { events: [], error: e instanceof Error ? e.message : "fetch failed", needsReauth: false };
  }
}

// --- Detect conflicts ---
function detectConflicts(events: any[]) {
  const conflicts: string[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (!a.start || !b.start || a.start.length <= 10 || b.start.length <= 10) continue;
      const aStart = new Date(a.start).getTime();
      const aEnd = new Date(a.end).getTime();
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push(`⚠️ CONFLICT: "${a.summary}" (${a.start}) overlaps with "${b.summary}" (${b.start})`);
      }
    }
  }
  return conflicts;
}

// --- Detect if user is asking about real data ---
function needsRealData(latestMessage: string): { emails: boolean; calendar: boolean } {
  const lower = latestMessage.toLowerCase();
  const emailKeywords = ["email", "emial", "emal", "inbox", "mail", "triage", "follow-up", "follow up", "reply", "replies", "unread", "urgent", "briefing", "brief me", "fill me in", "catch me up", "what did i miss", "missed", "what's new", "update me", "morning briefing", "what's going on", "what happened", "draft", "auto-draft", "snooze", "remind me", "important", "messages", "correspondence"];
  const calKeywords = ["meeting", "calendar", "schedule", "agenda", "today", "briefing", "brief me", "fill me in", "catch me up", "what's next", "morning briefing", "what's going on", "prep me", "conflict", "double-book", "reschedule", "availability", "free slot", "open time", "appointment", "event", "busy", "tomorrow"];

  return {
    emails: emailKeywords.some((k) => lower.includes(k)),
    calendar: calKeywords.some((k) => lower.includes(k)),
  };
}

// --- Sliding-window memory: keep recent turns verbatim, summarize older ones ---
const RECENT_TURNS_KEEP = 30;
const SUMMARY_TRIGGER = 40;

async function summarizeOlderMessages(older: any[], apiKey: string): Promise<string> {
  if (older.length === 0) return "";
  const transcript = older
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${(m.content || "").slice(0, 600)}`)
    .join("\n");
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Summarize the following conversation between a user and their AI executive assistant. Capture: (1) key facts the user shared about themselves, their work, contacts, and projects; (2) decisions made; (3) outstanding tasks/drafts/follow-ups; (4) tone preferences. Be dense and factual — no filler. Max 300 words.",
          },
          { role: "user", content: transcript },
        ],
        stream: false,
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("summarization failed:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, agentName, clientTimezone, clientNowIso, mode } = await req.json();
    const isVoice = mode === "voice";
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "The AI service is not configured yet. Please contact support.", code: "AI_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY") ?? "";
    if (!nylasApiKey) console.error("[chat] NYLAS_API_KEY not set — email/calendar fetch will be skipped");

    // Apply sliding window: summarize older turns when conversation gets long
    let conversationMemoryNote = "";
    let effectiveMessages = messages;
    if (Array.isArray(messages) && messages.length > SUMMARY_TRIGGER) {
      const older = messages.slice(0, messages.length - RECENT_TURNS_KEEP);
      const recent = messages.slice(messages.length - RECENT_TURNS_KEEP);
      const summary = await summarizeOlderMessages(older, GROQ_API_KEY);
      if (summary) {
        conversationMemoryNote = `\n\n## Earlier Conversation Summary\n${summary}\n`;
      }
      effectiveMessages = recent;
    }

    const tz = (typeof clientTimezone === "string" && clientTimezone) || "UTC";
    const now = clientNowIso ? new Date(clientNowIso) : new Date();
    const hourInTz = Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)
    );
    const timeOfDay = hourInTz < 12 ? "morning" : hourInTz < 17 ? "afternoon" : "evening";
    const today = new Intl.DateTimeFormat("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz,
    }).format(now);
    const currentTimeStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz, timeZoneName: "short",
    }).format(now);

    let realDataContext = "";
    const authHeader = req.headers.get("Authorization");

    // Always fetch real data when user is authenticated
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const adminForContacts = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const nylasGrants = await getAllNylasGrants(adminForContacts, user.id);
        // One grant covers both Gmail and Calendar in Nylas
        const primaryGrant = nylasGrants.length > 0 ? nylasGrants[0] : null;

        const todayDate = new Date().toISOString().slice(0, 10);
        const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const canFetchNylas = nylasApiKey.length > 0;

        const [
          gmailResults,
          calendarResult,
          contactsRes,
          leadsRes,
          actionItemsRes,
          remindersRes,
          briefingRes,
          stenoSessionsRes,
        ] = await Promise.all([
          canFetchNylas && nylasGrants.length > 0
            ? Promise.all(nylasGrants.map((g) => fetchRecentEmails(g.grantId, nylasApiKey, 8, g.email)))
            : Promise.resolve([]),
          canFetchNylas && primaryGrant ? fetchEvents(primaryGrant.grantId, nylasApiKey, 7) : Promise.resolve({ events: [], error: null }),
          adminForContacts
            .from("contacts")
            .select("name, email, company, role, notes, is_vip, last_interaction_at, last_interaction_summary, interaction_count, ai_summary, ai_topics, birthday")
            .eq("user_id", user.id)
            .order("is_vip", { ascending: false })
            .order("last_interaction_at", { ascending: false, nullsFirst: false })
            .limit(60),
          adminForContacts
            .from("leads")
            .select("from_name, from_email, subject, source, status, confidence, received_at")
            .eq("user_id", user.id)
            .in("status", ["new", "drafted"])
            .order("received_at", { ascending: false })
            .limit(20),
          adminForContacts
            .from("action_items")
            .select("title, description, priority, status, due_date, assignee, source")
            .eq("user_id", user.id)
            .in("status", ["open", "in_progress"])
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(30),
          adminForContacts
            .from("email_reminders")
            .select("email_subject, email_from, email_snippet, remind_at, status")
            .eq("user_id", user.id)
            .eq("status", "pending")
            .lte("remind_at", inSevenDays + "T23:59:59Z")
            .order("remind_at", { ascending: true })
            .limit(20),
          adminForContacts
            .from("daily_briefings")
            .select("summary, briefing_date, email_count, meeting_count, urgent_items")
            .eq("user_id", user.id)
            .eq("briefing_date", todayDate)
            .maybeSingle(),
          adminForContacts
            .from("steno_sessions")
            .select("id, title, summary, topics, transcript, transcript_file_path, attendees, location, key_points, item_count, created_at, session_date")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(15),
        ]);

        // Helper: load the archived transcript .txt from storage
        const loadArchivedTranscript = async (s: any): Promise<string> => {
          if (s?.transcript_file_path) {
            try {
              const { data, error } = await adminForContacts
                .storage
                .from("steno-transcripts")
                .download(s.transcript_file_path);
              if (!error && data) {
                const text = await data.text();
                if (text && text.trim().length > 0) return text;
              }
            } catch (_) { /* fall through to DB transcript */ }
          }
          return s?.transcript || "";
        };

        // Aggregate emails across all Nylas grants
        const allEmails: any[] = [];
        const gmailErrors: string[] = [];
        const gmailReauth: string[] = [];
        for (const r of gmailResults as any[]) {
          if (r?.needsReauth) gmailReauth.push(r.account);
          else if (r?.error) gmailErrors.push(`${r.account}: ${r.error}`);
          if (r?.emails) allEmails.push(...r.emails);
        }
        allEmails.sort((a, b) => {
          const da = new Date(a.date || 0).getTime();
          const db = new Date(b.date || 0).getTime();
          return db - da;
        });

        const events = (calendarResult as any).events || [];
        const calendarError = (calendarResult as any).error;
        const calendarNeedsReauth = (calendarResult as any).needsReauth;
        const contacts = contactsRes.data || [];
        const hotLeads = leadsRes.data || [];
        const actionItems = actionItemsRes.data || [];
        const reminders = remindersRes.data || [];
        const todaysBriefing = briefingRes.data;
        const stenoSessions = stenoSessionsRes.data || [];

        if (allEmails.length > 0) {
          const accountNote = nylasGrants.length > 1 ? ` (across ${nylasGrants.length} connected accounts)` : "";
          realDataContext += `\n\n--- REAL INBOX DATA${accountNote} ---\n`;
          allEmails.slice(0, 16).forEach((e: any, i: number) => {
            realDataContext += `\n[Email ${i + 1}] ${e.isUnread ? "🔵 UNREAD" : ""}${nylasGrants.length > 1 ? ` [${e.account}]` : ""}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Preview: ${e.snippet}\n`;
          });
          realDataContext += "\n--- END INBOX DATA ---\n";
        } else if (nylasGrants.length > 0 && gmailErrors.length === 0 && gmailReauth.length === 0) {
          realDataContext += "\n\n[Inbox is empty for the last 2 days — no recent messages.]\n";
        }

        if (gmailReauth.length > 0) {
          realDataContext += `\n\n[🔌 RECONNECT NEEDED: Google access expired for: ${gmailReauth.join(", ")}. Tell the user clearly: "I lost access to your Gmail (${gmailReauth.join(", ")}). Please reconnect via the plug icon → Integrations." Do NOT invent emails. Do NOT pretend you have access.]\n`;
        }
        if (gmailErrors.length > 0) {
          realDataContext += `\n\n[⚠️ Email data temporarily unavailable. Tell the user: "I'm having trouble reaching your inbox right now — it should resolve on its own. Try again in a moment." Do NOT mention any API names, service names, or technical details. Do NOT invent emails.]\n`;
        }

        if (events.length > 0) {
          realDataContext += "\n\n--- REAL CALENDAR DATA (next 7 days) ---\n";
          events.forEach((e: any, i: number) => {
            realDataContext += `\n[Event ${i + 1}]
ID: ${e.id}
Title: ${e.summary}
Time: ${e.start} – ${e.end}
Attendees: ${e.attendees?.map((a: any) => `${a.name} (${a.status})`).join(", ") || "None"}
Location: ${e.location || "None"}\n`;
          });

          const conflicts = detectConflicts(events);
          if (conflicts.length > 0) {
            realDataContext += "\n\n--- ⚠️ SCHEDULING CONFLICTS DETECTED ---\n";
            conflicts.forEach(c => { realDataContext += c + "\n"; });
            realDataContext += "--- END CONFLICTS ---\n";
          }
          realDataContext += "\n--- END CALENDAR DATA ---\n";
        } else if (primaryGrant && !calendarError) {
          realDataContext += "\n\n[No calendar events scheduled for the next 7 days.]\n";
        }

        if (calendarError) {
          if (calendarNeedsReauth) {
            realDataContext += `\n\n[🔌 RECONNECT NEEDED: Google Calendar access expired. Tell the user: "I lost access to your calendar. Please reconnect via the plug icon → Integrations." Do NOT invent meetings.]\n`;
          } else {
            realDataContext += `\n\n[⚠️ Calendar data temporarily unavailable. Tell the user: "I'm having trouble reaching your calendar right now — it should resolve on its own. Try again in a moment." Do NOT mention any API names, service names, or technical details. Do NOT invent meetings.]\n`;
          }
        }

        if (hotLeads.length > 0) {
          realDataContext += "\n\n--- 🔥 HOT LEADS (unresponded inquiries — TOP PRIORITY) ---\n";
          hotLeads.forEach((l: any) => {
            const ago = Math.round((Date.now() - new Date(l.received_at).getTime()) / 60000);
            realDataContext += `• ${l.from_name || l.from_email} via ${l.source || "unknown"} — "${l.subject}" (${ago} min ago, ${l.status})\n`;
          });
          realDataContext += "--- END HOT LEADS ---\nIMPORTANT: When the user asks 'what's important' or 'what should I do first', always surface hot leads at the top — these are revenue opportunities.\n";
        }

        if (actionItems.length > 0) {
          realDataContext += "\n\n--- OPEN ACTION ITEMS / TASKS ---\n";
          actionItems.forEach((a: any) => {
            const due = a.due_date ? ` (due ${a.due_date})` : "";
            const who = a.assignee ? ` [${a.assignee}]` : "";
            realDataContext += `• [${a.priority}] ${a.title}${due}${who}${a.description ? ` — ${a.description}` : ""}\n`;
          });
          realDataContext += "--- END ACTION ITEMS ---\n";
        }

        if (reminders.length > 0) {
          realDataContext += "\n\n--- UPCOMING EMAIL REMINDERS (next 7 days) ---\n";
          reminders.forEach((r: any) => {
            realDataContext += `• ${new Date(r.remind_at).toLocaleString()} — "${r.email_subject}" from ${r.email_from}\n`;
          });
          realDataContext += "--- END REMINDERS ---\n";
        }

        if (todaysBriefing) {
          realDataContext += `\n\n--- TODAY'S DAILY BRIEFING (already generated) ---\n${todaysBriefing.summary}\n--- END BRIEFING ---\n`;
        }

        // ---- STENO PAD: recent sessions + on-demand search across ALL sessions ----
        const latestUser = (effectiveMessages || []).filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";
        const latestLower = String(latestUser).toLowerCase();
        const stenoRecallTriggers = ["steno", "recording", "dictation", "meeting", "what did i say", "what was said", "remind me what", "from my notes", "from my recording", "what did we talk about", "in the meeting", "during the meeting", "with sarah", "with mark", "with mike", "with jay", "the call with", "the meeting with"];
        const recallTriggered = stenoRecallTriggers.some((k) => latestLower.includes(k));
        let matchedSessions: any[] = [];
        const TOP_N_FULL_RECALL = 3;
        const fullRecallIds = new Set<string>();
        if (recallTriggered) {
          const stop = new Set(["the","and","with","what","that","this","about","meeting","recording","steno","said","from","tell","told","talk","talked","remind","were","there","have","has","you","your","mine","our","they","them","when","where","who","why","how","did","does","done","ago","last","past","week","day","days","time","just","some","any","ours","into","over","after","before"]);
          const tokens = String(latestUser)
            .split(/[^a-zA-Z0-9']+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 3 && !stop.has(t.toLowerCase()))
            .slice(0, 12);
          const tokensLower = tokens.map((t) => t.toLowerCase());
          const recentIds = new Set(stenoSessions.map((s: any) => s.id));

          let candidates: any[] = [];
          if (tokens.length > 0) {
            const orParts: string[] = [];
            for (const t of tokens) {
              const safe = t.replace(/[%,]/g, "");
              orParts.push(`title.ilike.%${safe}%`, `summary.ilike.%${safe}%`, `transcript.ilike.%${safe}%`, `location.ilike.%${safe}%`);
            }
            const { data: searchRows } = await adminForContacts
              .from("steno_sessions")
              .select("id, title, summary, topics, transcript, transcript_file_path, attendees, location, key_points, item_count, created_at")
              .eq("user_id", user.id)
              .or(orParts.join(","))
              .order("created_at", { ascending: false })
              .limit(25);
            candidates = (searchRows || []).filter((s: any) => !recentIds.has(s.id));
          }

          if (candidates.length > 0) {
            const keywordScore = (s: any): number => {
              const hay = [
                s.title || "",
                s.summary || "",
                s.location || "",
                (s.topics || []).join(" "),
                (s.attendees || []).join(" "),
                (s.key_points || []).join(" "),
              ].join(" ").toLowerCase();
              let hits = 0;
              for (const t of tokensLower) if (hay.includes(t)) hits++;
              return tokensLower.length ? hits / tokensLower.length : 0;
            };

            const semanticScores = new Map<string, number>();
            try {
              const briefs = candidates.map((s: any, idx: number) => {
                const att = (s.attendees || []).slice(0, 5).join(", ");
                const top = (s.topics || []).slice(0, 5).join(", ");
                const kp = (s.key_points || []).slice(0, 3).join(" | ");
                const sum = (s.summary || "").slice(0, 300);
                return `#${idx} id=${s.id}\nTitle: ${s.title || "(untitled)"}\nWho: ${att || "n/a"} | Where: ${s.location || "n/a"} | Topics: ${top || "n/a"}\nSummary: ${sum}\nKey points: ${kp}`;
              }).join("\n---\n");
              const aiResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "llama-3.3-70b-versatile",
                  messages: [
                    { role: "system", content: "You score how semantically relevant each meeting session is to the user's recall question. Return a score 0.0-1.0 per session id. Be strict — only sessions plausibly answering the question score above 0.5." },
                    { role: "user", content: `Question: "${latestUser}"\n\nSessions:\n${briefs}` },
                  ],
                  tools: [{
                    type: "function",
                    function: {
                      name: "score_sessions",
                      description: "Return semantic relevance scores for each session.",
                      parameters: {
                        type: "object",
                        properties: {
                          scores: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                score: { type: "number" },
                              },
                              required: ["id", "score"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["scores"],
                        additionalProperties: false,
                      },
                    },
                  }],
                  tool_choice: { type: "function", function: { name: "score_sessions" } },
                  stream: false,
                }),
              });
              if (aiResp.ok) {
                const data = await aiResp.json();
                const argsStr = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
                if (argsStr) {
                  const parsed = JSON.parse(argsStr);
                  for (const row of parsed.scores || []) {
                    if (row?.id && typeof row.score === "number") {
                      semanticScores.set(row.id, Math.max(0, Math.min(1, row.score)));
                    }
                  }
                }
              }
            } catch (e) {
              console.error("[steno recall] semantic scoring failed:", e);
            }

            const ranked = candidates
              .map((s: any) => {
                const kw = keywordScore(s);
                const sem = semanticScores.get(s.id);
                const combined = sem === undefined ? kw : 0.4 * kw + 0.6 * sem;
                return { s, kw, sem: sem ?? null, combined };
              })
              .filter((r) => r.combined > 0.15)
              .sort((a, b) => b.combined - a.combined);

            console.log(`[steno recall] ${candidates.length} candidates → ${ranked.length} ranked. top:`, ranked.slice(0, 5).map((r) => ({ id: r.s.id, title: r.s.title, kw: r.kw, sem: r.sem, combined: r.combined })));

            matchedSessions = ranked.slice(0, 8).map((r) => r.s);
            ranked.slice(0, TOP_N_FULL_RECALL).forEach((r) => fullRecallIds.add(r.s.id));
          }
        }

        if (stenoSessions.length > 0 || matchedSessions.length > 0) {
          realDataContext += "\n\n--- STENO FOLDER (user's saved meeting recordings & dictations — long-term memory) ---\n";
          realDataContext += "Each session has a Title, Date, Attendees (who was there), Location, Summary, and full Transcript loaded from the archived .txt file in the user's steno folder. Reference these when the user asks 'what did I say about X', 'what was said in the meeting with Sarah', 'remind me what we discussed', or anything where their own past notes are relevant. Quote sparingly — don't dump full transcripts unless asked.\n";
          realDataContext += "PROACTIVE CALENDAR RULE: If a session transcript mentions something time-sensitive that does NOT already appear on the user's calendar above (a flight, dinner, demo, deadline, recurring 1:1, etc.), proactively offer to add it: \"Hey, you mentioned X on [date] in your meeting with [who] — should I add it to your calendar? Sounded important.\" Use the user's first name if you know it. Only offer once per item per conversation.\n";

          const fullRecent = stenoSessions.slice(0, 3);
          const fullMatched = matchedSessions.filter((s: any) => fullRecallIds.has(s.id));
          const fullTranscriptMap = new Map<string, string>();
          const toLoad = [...fullRecent, ...fullMatched];
          await Promise.all(
            toLoad.map(async (s: any) => {
              const txt = await loadArchivedTranscript(s);
              fullTranscriptMap.set(s.id, txt);
            })
          );

          const renderSession = (s: any, idx: number, full: boolean) => {
            const when = new Date(s.created_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
            const att = (s.attendees && s.attendees.length) ? s.attendees.join(", ") : "solo / not specified";
            const loc = s.location || "not specified";
            const topicStr = (s.topics && s.topics.length) ? ` | topics: ${s.topics.join(", ")}` : "";
            const sum = s.summary ? `\n   Summary: ${s.summary}` : "";
            const limit = full ? 12000 : (idx < 3 ? 6000 : 800);
            const sourceText = fullTranscriptMap.get(s.id) || (full ? (s.transcript || "") : "");
            const tx = sourceText.slice(0, limit);
            const truncated = sourceText.length > limit;
            const kp = (s.key_points && s.key_points.length) ? `\n   Key points:\n${s.key_points.map((k: string) => `     • ${k}`).join("\n")}` : "";
            const src = full ? (s.transcript_file_path ? " (archived .txt)" : " (db)") : " (metadata only — ask to dig deeper)";
            const body = full || idx < 3
              ? `\n   Transcript${full ? "" : " excerpt"}${src}: ${tx}${truncated ? "…" : ""}\n`
              : `${src}\n`;
            return `\n[Session] "${s.title}"\n   Date: ${when}\n   Who: ${att}\n   Where: ${loc}${topicStr}${sum}${kp}${body}`;
          };

          stenoSessions.forEach((s: any, i: number) => {
            realDataContext += renderSession(s, i, false);
          });

          if (matchedSessions.length > 0) {
            realDataContext += `\n[Recall match — ranked by keyword + semantic relevance. Top ${Math.min(TOP_N_FULL_RECALL, matchedSessions.length)} have FULL archived .txt loaded; the rest are metadata-only — say so if the user asks for details on those:]\n`;
            matchedSessions.forEach((s: any) => {
              realDataContext += renderSession(s, 0, fullRecallIds.has(s.id));
            });
          }
          realDataContext += "--- END STENO FOLDER ---\n";
        }

        if (contacts.length > 0) {
          realDataContext += "\n\n--- CONTACT INTELLIGENCE (people the user knows) ---\n";
          contacts.forEach((c: any) => {
            const last = c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString() : "unknown";
            const aiBrief = c.ai_summary ? ` | AI brief: ${c.ai_summary}` : "";
            const topics = c.ai_topics && c.ai_topics.length ? ` | topics: ${c.ai_topics.join(", ")}` : "";
            const bday = c.birthday ? ` | birthday: ${c.birthday}` : "";
            realDataContext += `• ${c.name}${c.is_vip ? " ⭐VIP" : ""} <${c.email || "no-email"}>${c.role ? ` — ${c.role}` : ""}${c.company ? ` @ ${c.company}` : ""} | last: ${last} (${c.interaction_count}x)${c.notes ? ` | notes: ${c.notes}` : ""}${c.last_interaction_summary ? ` | recent: ${c.last_interaction_summary}` : ""}${aiBrief}${topics}${bday}\n`;
          });
          realDataContext += "--- END CONTACTS ---\n";
        }

        // ---- PEOPLE DIRECTORY ----
        const directory = new Map<string, { name: string; email: string; sources: Set<string> }>();
        const addPerson = (rawName: string | null | undefined, rawEmail: string | null | undefined, source: string) => {
          if (!rawEmail) return;
          const email = String(rawEmail).trim().toLowerCase();
          if (!email || !email.includes("@")) return;
          const name = (rawName || "").trim() || email.split("@")[0];
          const existing = directory.get(email);
          if (existing) {
            existing.sources.add(source);
            if (name.length > existing.name.length) existing.name = name;
          } else {
            directory.set(email, { name, email, sources: new Set([source]) });
          }
        };

        contacts.forEach((c: any) => addPerson(c.name, c.email, "contacts"));
        hotLeads.forEach((l: any) => addPerson(l.from_name, l.from_email, "leads"));

        const parseFromHeader = (from: string): { name: string; email: string } | null => {
          if (!from) return null;
          const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
          if (m) return { name: m[1].trim(), email: m[2].trim() };
          if (from.includes("@")) return { name: "", email: from.trim() };
          return null;
        };
        allEmails.slice(0, 50).forEach((e: any) => {
          const parsed = parseFromHeader(e.from || "");
          if (parsed) addPerson(parsed.name, parsed.email, "inbox");
        });

        events.forEach((ev: any) => {
          (ev.attendees || []).forEach((a: any) => addPerson(a.name, a.email, "calendar"));
        });

        if (directory.size > 0) {
          const NICKNAMES: Record<string, string[]> = {
            jay: ["jason", "james", "jacob"],
            jason: ["jay"], james: ["jim", "jimmy", "jamie", "jay"], jacob: ["jake", "jay"],
            jim: ["james"], jimmy: ["james"], jamie: ["james"], jake: ["jacob"],
            mike: ["michael"], michael: ["mike", "mikey"], mikey: ["michael"],
            bob: ["robert"], rob: ["robert"], bobby: ["robert"], robbie: ["robert"], robert: ["bob", "rob", "bobby", "robbie"],
            bill: ["william"], will: ["william"], billy: ["william"], willy: ["william"], william: ["bill", "will", "billy"],
            tom: ["thomas"], tommy: ["thomas"], thomas: ["tom", "tommy"],
            dan: ["daniel"], danny: ["daniel"], daniel: ["dan", "danny"],
            dave: ["david"], davy: ["david"], david: ["dave"],
            chris: ["christopher", "christine", "christina"], christopher: ["chris"], christine: ["chris"],
            matt: ["matthew"], matty: ["matthew"], matthew: ["matt"],
            nick: ["nicholas"], nicholas: ["nick"],
            alex: ["alexander", "alexandra", "alexis"], alexander: ["alex"], alexandra: ["alex"],
            sam: ["samuel", "samantha"], samuel: ["sam"], samantha: ["sam"],
            ben: ["benjamin"], benjamin: ["ben"], benji: ["benjamin"],
            joe: ["joseph"], joey: ["joseph"], joseph: ["joe", "joey"],
            tony: ["anthony"], anthony: ["tony"],
            steve: ["steven", "stephen"], steven: ["steve"], stephen: ["steve"],
            rick: ["richard"], richie: ["richard"], dick: ["richard"], richard: ["rick", "richie"],
            kate: ["katherine", "kathryn", "katie"], katie: ["katherine"], kathy: ["katherine"], katherine: ["kate", "katie", "kathy"], kathryn: ["kate", "katie"],
            liz: ["elizabeth"], beth: ["elizabeth"], lizzy: ["elizabeth"], eliza: ["elizabeth"], elizabeth: ["liz", "beth", "lizzy", "eliza"],
            sue: ["susan"], susie: ["susan"], susan: ["sue", "susie"],
            peggy: ["margaret"], maggie: ["margaret"], meg: ["margaret"], margaret: ["peggy", "maggie", "meg"],
            jen: ["jennifer"], jenny: ["jennifer"], jennifer: ["jen", "jenny"],
            patty: ["patricia"], pat: ["patricia", "patrick"], patricia: ["patty", "pat"], patrick: ["pat"],
            abby: ["abigail"], abigail: ["abby"],
            andy: ["andrew"], drew: ["andrew"], andrew: ["andy", "drew"],
            ed: ["edward"], eddie: ["edward"], ted: ["edward", "theodore"], teddy: ["theodore"], edward: ["ed", "eddie", "ted"], theodore: ["ted", "teddy"],
            charlie: ["charles"], chuck: ["charles"], charles: ["charlie", "chuck"],
            ron: ["ronald"], ronnie: ["ronald"], ronald: ["ron", "ronnie"],
            greg: ["gregory"], gregory: ["greg"],
            ken: ["kenneth"], kenny: ["kenneth"], kenneth: ["ken", "kenny"],
          };
          const expandFirst = (first: string): string[] => {
            const f = first.toLowerCase();
            const out = new Set<string>([f]);
            (NICKNAMES[f] || []).forEach((n) => out.add(n));
            return [...out];
          };

          realDataContext += "\n\n--- PEOPLE DIRECTORY (name → email lookup) ---\n";
          realDataContext += "Format per line: <Display Name> <email> | aliases: <comma-separated lookup tokens> | sources\n";
          realDataContext += "When the user names someone, match against the display name OR any alias token (case-insensitive).\n";
          const dirEntries = [...directory.values()].slice(0, 120);
          dirEntries.forEach((p) => {
            const aliases = new Set<string>();
            const cleaned = p.name.replace(/[",]/g, " ").replace(/\s+/g, " ").trim();
            if (cleaned) aliases.add(cleaned.toLowerCase());

            const parts = cleaned.split(" ").filter(Boolean);
            if (parts.length >= 2) {
              const first = parts[0];
              const last = parts[parts.length - 1];
              aliases.add(first.toLowerCase());
              aliases.add(last.toLowerCase());
              aliases.add(`${last} ${first}`.toLowerCase());
              aliases.add(`${last}, ${first}`.toLowerCase());
              aliases.add(`${first[0]} ${last}`.toLowerCase());
              aliases.add(`${first[0]}. ${last}`.toLowerCase());
              aliases.add(`${first} ${last[0]}`.toLowerCase());
              aliases.add(`${first} ${last[0]}.`.toLowerCase());
              if (parts.length > 2) {
                for (let i = 1; i < parts.length - 1; i++) {
                  aliases.add(parts[i].toLowerCase());
                  aliases.add(`${parts[i]} ${last}`.toLowerCase());
                }
              }
              expandFirst(first).forEach((alt) => {
                if (alt !== first.toLowerCase()) {
                  aliases.add(alt);
                  aliases.add(`${alt} ${last}`.toLowerCase());
                  aliases.add(`${last} ${alt}`.toLowerCase());
                  aliases.add(`${last}, ${alt}`.toLowerCase());
                }
              });
            } else if (parts.length === 1) {
              aliases.add(parts[0].toLowerCase());
              expandFirst(parts[0]).forEach((alt) => aliases.add(alt));
            }
            aliases.add(p.email.split("@")[0].toLowerCase());

            const aliasList = [...aliases].filter(Boolean).join(", ");
            realDataContext += `• ${p.name} <${p.email}> | aliases: ${aliasList} | [${[...p.sources].join(",")}]\n`;
          });
          realDataContext += "--- END PEOPLE DIRECTORY ---\n";
        }

        // File search capability hint
        realDataContext += "\n\n--- FILE SEARCH AVAILABLE ---\n";
        realDataContext += "The user has a Files page at /files where they can search across Google Drive and Gmail attachments using natural language (read-only — you cannot delete or modify files). When the user asks to find a file, document, attachment, contract, PDF, deck, spreadsheet, etc., suggest the Files page as a Next Step. Example asks: 'find the contract Sarah sent', 'where's the Q3 deck', 'pull up that invoice from Acme'.\n";
        realDataContext += "--- END FILE SEARCH ---\n";

        // Tasks capability hint
        realDataContext += "\n\n--- TASKS CAPABILITY ---\n";
        realDataContext += "The user has a Tasks page at /tasks for managing action items (open + completed, with priorities, due dates, assignees). The OPEN ACTION ITEMS section above is the live list. When the user asks 'what's on my list', 'what do I need to do', 'what's overdue', reference that data directly. When they say 'add a task to <X>' or 'remind me to <X>', tell them you've noted it and direct them to the Tasks page to confirm — do NOT silently insert. When asked to 'find tasks I owe people' or 'what did I commit to', scan recent emails in REAL INBOX DATA for implicit commitments and suggest they hit 'Scan inbox for tasks' on the /tasks page for an AI sweep.\n";
        realDataContext += "--- END TASKS ---\n";

        if (!canFetchNylas && nylasGrants.length > 0) {
          realDataContext += "\n\n[Email and calendar are connected but temporarily unavailable due to a backend configuration issue. Do NOT tell the user to reconnect — their connection is fine. Just say email data isn't available right now and you'll check again shortly.]\n";
        } else if (nylasGrants.length === 0) {
          realDataContext += "\n\n[No Google accounts connected. If the user asks about emails or calendar, let them know they can connect via Integrations (plug icon in the top right).]\n";
        }
      }
    }

    const systemPrompt = `You are ${agentName || "Normy"}, an elite AI executive assistant. Today is ${today}. The user's local time right now is ${currentTimeStr} (${tz}) — it is ${timeOfDay}. ALWAYS reason about dates and times relative to this local time, never UTC.

${isVoice ? `
## VOICE MODE — CRITICAL
You are speaking out loud through TTS. Sound like a real human EA on the phone — NOT a memo being read.
- **NO bullet points. NO headers. NO "Next Steps:" labels. NO emojis. NO markdown.** Ever. Spoken speech only.
- Use natural spoken English with contractions ("you've", "I'll", "let's"). Never read raw data, ISO dates, or URLs aloud — reference them naturally ("Sarah's email about the budget", "your 3 PM with Jay").
- No draft-json blocks — if asked to draft something, briefly say what you'll draft and confirm verbally.
- calendar-json blocks ARE allowed in voice mode — the user can't hear them (TTS strips code blocks), but the UI will show a tap-to-confirm button. When the user asks to create/add/schedule an event, say it naturally ("I'll add that to your calendar and send an invite to John — just tap to confirm") AND emit the calendar-json block silently below your spoken response. Follow the same calendar-json rules as text mode, including resolving attendee emails from the PEOPLE DIRECTORY.

### Pacing — match length to the request
**Default (normal questions, status checks, quick asks): 1-2 short sentences, then one natural follow-up question.**
- Examples: "What's on my calendar?", "Any urgent emails?", "Did Sarah reply?"
- Mention the most important item and offer more ("There's an urgent one from Sarah — want the rest?"). End with one question like "Want me to draft that?" or "Anything else?".

**Extended (only when the user explicitly asks for depth): up to ~6 sentences, still no lists or markdown.**
- Trigger phrases: "tell me more", "give me the details", "walk me through", "explain", "read it to me", "the full thing", "everything", "in depth", "summarize the whole…", "what did they say exactly".
- Speak it as a flowing paragraph — connect items with "also", "then", "and the last one". Still end with one short follow-up question.
- If the user asks to read an email/doc verbatim, you may go longer, but paraphrase formatting (no "Subject colon…").

When in doubt, stay short and offer more. Never volunteer a long answer the user didn't ask for.
` : `
## CRITICAL: Response Style — Be Concise by Default
- **ALWAYS reply in short, conversational text** — like a real human assistant texting you back. 2-4 sentences max for most replies.
- **NEVER dump full email contents, raw data, or long lists** unless the user explicitly asks for details (e.g., "show me the full email", "list all my emails", "give me the details").
- When referencing emails or meetings, mention them briefly by sender/subject — don't paste snippets or bodies.
- Example good reply: "You have 3 unread emails — one urgent from Sarah about the Q3 budget. Want me to draft a reply?"
- Example bad reply: listing out every email with From/Subject/Date/Preview fields.
- If the user asks "what's in my inbox?" give a brief summary with counts and highlights, NOT a full list.
- Only expand into detail when the user says things like "show me", "tell me more", "what does it say", "give me the full email", or "details".

## NEXT STEPS (CRITICAL)
At the end of EVERY response, include 2-3 brief action suggestions the user can say "yes" to. Keep them on one line each. Format as a simple list under "**Next Steps:**"

## DRAFT FORMAT
When you draft email replies, include a structured JSON block so the user can save them. Use this exact format after each draft:

\`\`\`draft-json
{"to_email": "recipient@example.com", "to_name": "Recipient Name", "subject": "Re: Subject line", "body": "Full plain text body of the draft"}
\`\`\`

Keep draft bodies concise and professional. Only show drafts when the user asks you to draft something.

## CALENDAR EVENT FORMAT
When the user asks you to create, add, or schedule a calendar event, include a structured JSON block so the event can be created with one tap. Use this exact format:

\`\`\`calendar-json
{"summary": "Event title", "start": "2026-05-29T10:00:00", "end": "2026-05-29T11:00:00", "description": "Optional notes", "location": "Optional location", "allDay": false, "attendees": [{"email": "person@example.com", "name": "Person Name"}]}
\`\`\`

Rules:
- \`summary\` and \`start\` are required. \`end\` defaults to 1 hour after start if omitted.
- \`start\` and \`end\` must be ISO 8601 datetime strings in the user's local timezone (e.g. "2026-05-29T14:00:00"). For all-day events set \`allDay\` to true and use date-only strings like "2026-05-29".
- Always infer the date from context (today is ${new Date().toISOString().slice(0, 10)}). If the user says "tomorrow at 3pm", compute the correct date.
- **\`attendees\` is critical**: whenever the user mentions inviting someone or scheduling WITH someone, include them in \`attendees\` with their resolved email from the PEOPLE DIRECTORY. This is what sends the calendar invite to their inbox. If you cannot resolve their email, ask before emitting the block.
- \`attendees\` may be an empty array [] if no guests — do NOT omit the field.
- Only emit a calendar-json block when the user explicitly asks to create/add/schedule an event. Do NOT emit one just because you mention a date.
- You may emit both a draft-json and a calendar-json in the same response (e.g. send an invite email + add the event to calendar).

## CANCEL EVENT FORMAT
When the user asks to cancel, delete, or remove a calendar event, emit this block so it can be cancelled with one tap (attendees get notified automatically):

\`\`\`cancel-event-json
{"eventId": "nylas_event_id_here", "summary": "Event title", "notifyAttendees": true}
\`\`\`

Rules:
- \`eventId\` MUST come from the event data in REAL CALENDAR DATA above — look for the event by title/time and use its id field exactly. Never invent an id.
- \`summary\` is the human-readable event title shown on the button.
- \`notifyAttendees\` defaults to true — sends cancellation emails to all attendees. Only set false if the user explicitly says "don't notify" or "quietly remove".
- If the user says "cancel my 3pm" and you can identify the event from REAL CALENDAR DATA, emit the block immediately. If ambiguous (multiple matches), ask which one before emitting.
- Do NOT emit cancel-event-json if the event is not found in REAL CALENDAR DATA — tell the user you can't see it.
`}

## Data Relevance Rule
You have access to the user's real email and calendar data below. ONLY mention or reference this data when it is relevant to what the user is asking about. If the user asks a general question, makes small talk, or asks about something unrelated to emails/calendar, respond naturally WITHOUT bringing up their inbox or schedule. Do NOT volunteer email or calendar summaries unless the user asks about them or the context clearly calls for it.

## Your Identity
You are the user's trusted chief of staff — proactive, organized, and anticipatory. You don't just answer questions; you think ahead, flag risks, and take initiative. You behave like a real-life executive assistant who is always one step ahead.

## CRITICAL RULE
When the user asks about their emails, meetings, calendar, or anything related to their real data:
- ONLY reference the REAL DATA provided below. Never invent fake emails, meetings, or contacts.
- If no real data is provided, tell the user to connect their accounts via Integrations (the plug icon in the top right).
- If real data IS provided, summarize it briefly with sender names and subjects. Only show full details if asked.

## CRITICAL: Never Fabricate URLs or Links
- NEVER invent, guess, or hallucinate URLs, links, or file paths. This includes Google Docs, Sheets, Drive links, websites, or any other URL.
- If the user asks about a specific document or link, tell them to check their email or calendar for the actual link — do NOT make one up.
- You may only reference URLs that appear explicitly in the real data provided below.

## Resolving People by Name (CRITICAL)
When the user refers to someone by name (e.g., "send Jay Niblick a calendar invite", "email Sarah", "tell Mike I'll be late") and does NOT provide an email address:
1. **Look them up in the PEOPLE DIRECTORY below** (and CONTACT INTELLIGENCE / HOT LEADS / inbox / calendar). Match the user's spoken input (case-insensitive) against either the display name OR any token in the entry's "aliases:" list — these already include first name, last name, swapped order ("Niblick Jay", "Niblick, Jay"), initials + partials ("J Niblick", "Jay N", "Jay N."), middle names, and common nicknames (Jay↔Jason/James, Mike↔Michael, Liz↔Elizabeth, Kate↔Katherine, etc.). If the user's spoken input appears in any alias list, that's a match.
2. **Handle partial inputs (first-name only, last-name only, "First L." style).** Treat "Jay", "Patel", "Jay N.", "J. Niblick" as valid lookup tokens. Scan the ENTIRE directory and collect every entry where the spoken token matches the display name or any alias as a whole word (so "Jay" matches "Jay Niblick" and "Jay Patel" but not "Jayla"; "Patel" matches "Jay Patel" and "Anita Patel"). Partial inputs almost always produce multiple candidates — expect to disambiguate.
3. **Count ALL matches before acting.** Do not stop at the first match; a short/partial name is a strong signal there may be several.
4. **If exactly one match → proceed silently.** Use that email automatically and quietly mention who you're sending to ("Sending to Jay Niblick at jay@…"). No confirmation needed.
5. **If two or more matches → ALWAYS disambiguate first. Never guess, never pick the most recent, never default to the VIP.** Ask one short question and list the candidates by full name + the most distinguishing detail (company, role, or email domain) — not by email address. Use this exact shape:
   - Voice mode: "I've got two Jays — Jay Niblick at Acme, or Jay Patel at Stripe. Which one?"
   - Voice mode (last-name partial): "Two Patels — Jay Patel at Stripe, or Anita Patel at Acme. Which one?"
   - Text mode:
     "I see a couple of matches for **Jay** — which one?
     • Jay Niblick — Acme (CEO)
     • Jay Patel — Stripe (Eng Lead)"
   Wait for the user's reply before drafting anything. Do NOT include a draft-json block in the disambiguation turn. If the user replies with another partial ("the one at Acme", "Niblick", "the CEO"), re-match against the candidate list and proceed once exactly one remains.
6. **If no match → ask for the email.** Say so honestly. Do NOT guess or fabricate an email like "jay.niblick@example.com".
7. When drafting an email or calendar invite (after resolution), populate the to_email and to_name fields in the draft-json block from the chosen directory entry.


## Core Capabilities
- Smart email triage, auto-draft replies, follow-up detection
- Conflict detection, meeting prep, smart scheduling
- Proactive flagging of overdue replies, back-to-back meetings, VIP contacts
${conversationMemoryNote}${realDataContext}`;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...effectiveMessages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm getting too many requests right now — give me a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage to keep chatting." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status >= 500) {
        const text = await response.text().catch(() => "");
        console.error("AI gateway 5xx:", response.status, text);
        return new Response(
          JSON.stringify({ error: "The AI service is temporarily unavailable. Please try again in a minute." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI service returned an error. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isVoice && response.body) {
      const lastUserMsg = [...effectiveMessages].reverse().find((m: any) => m?.role === "user");
      const userText: string = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
      const EXTENDED_TRIGGERS = /\b(tell me more|more detail|details?|walk me through|explain|read it (to me|aloud)|the full thing|everything|in depth|in-depth|summari[sz]e the whole|what did they say exactly|go deeper|elaborate|long(er)? version)\b/i;
      const userRequestedExtended = EXTENDED_TRIGGERS.test(userText);

      const [clientStream, metricsStream] = response.body.tee();

      (async () => {
        try {
          const reader = metricsStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let assistantText = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, idx).replace(/\r$/, "");
              buffer = buffer.slice(idx + 1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string") assistantText += delta;
              } catch { /* ignore partial */ }
            }
          }
          const sentences = assistantText
            .replace(/\s+/g, " ")
            .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
            .map((s) => s.trim())
            .filter((s) => s.length > 1);
          const sentenceCount = sentences.length;
          const wordCount = assistantText.trim().split(/\s+/).filter(Boolean).length;
          const extendedProduced = sentenceCount > 2;
          const triggerMatch = extendedProduced === userRequestedExtended ? "ok"
            : userRequestedExtended ? "missed-extended"
            : "over-extended";
          console.log(`[voice-metrics] ${JSON.stringify({
            sentences: sentenceCount,
            words: wordCount,
            userRequestedExtended,
            extendedProduced,
            triggerMatch,
            userPreview: userText.slice(0, 80),
          })}`);
        } catch (err) {
          console.error("[voice-metrics] failed:", err);
        }
      })();

      return new Response(clientStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const isNetwork = /fetch|network|timeout|abort/i.test(msg);
    return new Response(
      JSON.stringify({
        error: isNetwork
          ? "Couldn't reach the AI service. Check your connection and try again."
          : "Something went wrong on my end. Please try again.",
        detail: msg,
      }),
      { status: isNetwork ? 503 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
