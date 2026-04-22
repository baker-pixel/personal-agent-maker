import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Token helpers ---
async function refreshIfNeeded(adminClient: any, tokenRow: any) {
  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json();
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
    .maybeSingle();
  if (error || !tokenRow) return null;
  return await refreshIfNeeded(adminClient, tokenRow);
}

// Get ALL Gmail tokens for a user (multi-account support)
async function getAllGmailTokens(userId: string): Promise<{ token: string; email: string }[]> {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: rows } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail");
  if (!rows || rows.length === 0) return [];
  const results: { token: string; email: string }[] = [];
  for (const row of rows) {
    const t = await refreshIfNeeded(adminClient, row);
    if (t) results.push({ token: t, email: row.email || "primary" });
  }
  return results;
}

// --- Gmail fetch with timeout ---
// Returns { emails, error } so the caller can distinguish empty inbox from a failed fetch.
async function fetchRecentEmails(accessToken: string, maxResults = 30, accountLabel = "") {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox newer_than:2d`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal }
    );
    if (!listRes.ok) {
      clearTimeout(timeoutId);
      const needsReauth = listRes.status === 401 || listRes.status === 403;
      return {
        emails: [],
        error: needsReauth
          ? `authentication expired (HTTP ${listRes.status}) — user needs to reconnect this account`
          : `Gmail API returned ${listRes.status}`,
        needsReauth,
        account: accountLabel,
      };
    }
    const listData = await listRes.json();
    if (!listData.messages?.length) { clearTimeout(timeoutId); return { emails: [], error: null, needsReauth: false, account: accountLabel }; }

    const emails = await Promise.all(
      listData.messages.slice(0, maxResults).map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          id: msg.id,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: msgData.snippet,
          isUnread: (msgData.labelIds || []).includes("UNREAD"),
          account: accountLabel,
        };
      })
    );
    clearTimeout(timeoutId);
    return { emails, error: null, needsReauth: false, account: accountLabel };
  } catch (e) {
    console.error("Gmail fetch error or timeout:", e);
    return { emails: [], error: e instanceof Error ? e.message : "fetch failed", needsReauth: false, account: accountLabel };
  }
}

// --- Calendar fetch (multi-day for conflict detection) ---
async function fetchEvents(accessToken: string, days = 7) {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 6000);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal }
    );
    if (!calRes.ok) {
      clearTimeout(timeoutId);
      const needsReauth = calRes.status === 401 || calRes.status === 403;
      return {
        events: [],
        error: needsReauth
          ? `authentication expired (HTTP ${calRes.status}) — user needs to reconnect calendar`
          : `Calendar API returned ${calRes.status}`,
        needsReauth,
      };
    }
    const calData = await calRes.json();
    clearTimeout(timeoutId);
    if (calData.error) return { events: [], error: calData.error.message || "calendar error", needsReauth: false };

    const events = (calData.items || []).map((event: any) => ({
      summary: event.summary || "(No title)",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      attendees: (event.attendees || []).map((a: any) => ({
        name: a.displayName || a.email,
        email: a.email,
        status: a.responseStatus,
      })),
      location: event.location || "",
      conferenceLink: event.hangoutLink || "",
    }));
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
const RECENT_TURNS_KEEP = 30; // last N messages sent verbatim
const SUMMARY_TRIGGER = 40;   // only summarize when total exceeds this

async function summarizeOlderMessages(older: any[], apiKey: string): Promise<string> {
  if (older.length === 0) return "";
  const transcript = older
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${(m.content || "").slice(0, 600)}`)
    .join("\n");
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Apply sliding window: if conversation is long, summarize older turns
    let conversationMemoryNote = "";
    let effectiveMessages = messages;
    if (Array.isArray(messages) && messages.length > SUMMARY_TRIGGER) {
      const older = messages.slice(0, messages.length - RECENT_TURNS_KEEP);
      const recent = messages.slice(messages.length - RECENT_TURNS_KEEP);
      const summary = await summarizeOlderMessages(older, LOVABLE_API_KEY);
      if (summary) {
        conversationMemoryNote = `\n\n## CONVERSATION MEMORY (summary of earlier turns — treat as established context)\n${summary}\n`;
      }
      effectiveMessages = recent;
      console.log(`[memory] summarized ${older.length} older turns, kept ${recent.length} recent`);
    }

    // Use the user's local time/timezone (sent from the client) so the model
    // doesn't think it's "evening" when the server's UTC clock says so.
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

    // Always fetch real data when user is authenticated — no keyword gating
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const [gmailAccounts, calToken] = await Promise.all([
          getAllGmailTokens(user.id),
          getValidToken(user.id, "google-calendar"),
        ]);

        const adminForContacts = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const todayDate = new Date().toISOString().slice(0, 10);
        const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const [
          gmailResults,
          calendarResult,
          contactsRes,
          leadsRes,
          actionItemsRes,
          remindersRes,
          briefingRes,
        ] = await Promise.all([
          gmailAccounts.length > 0
            ? Promise.all(gmailAccounts.map((acc) => fetchRecentEmails(acc.token, 8, acc.email)))
            : Promise.resolve([]),
          calToken ? fetchEvents(calToken, 7) : Promise.resolve({ events: [], error: null }),
          adminForContacts
            .from("contacts")
            .select("name, email, company, role, notes, is_vip, last_interaction_at, last_interaction_summary, interaction_count")
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
        ]);

        // Aggregate emails across all Gmail accounts; track per-account fetch errors
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

        if (allEmails.length > 0) {
          const accountNote = gmailAccounts.length > 1 ? ` (across ${gmailAccounts.length} connected accounts)` : "";
          realDataContext += `\n\n--- REAL INBOX DATA${accountNote} ---\n`;
          allEmails.slice(0, 16).forEach((e: any, i: number) => {
            realDataContext += `\n[Email ${i + 1}] ${e.isUnread ? "🔵 UNREAD" : ""}${gmailAccounts.length > 1 ? ` [${e.account}]` : ""}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Preview: ${e.snippet}\n`;
          });
          realDataContext += "\n--- END INBOX DATA ---\n";
        } else if (gmailAccounts.length > 0 && gmailErrors.length === 0 && gmailReauth.length === 0) {
          realDataContext += "\n\n[Inbox is empty for the last 2 days — no recent messages.]\n";
        }

        if (gmailReauth.length > 0) {
          realDataContext += `\n\n[🔌 RECONNECT NEEDED: Google access expired for: ${gmailReauth.join(", ")}. Tell the user clearly: "I lost access to your Gmail (${gmailReauth.join(", ")}). Please reconnect via the plug icon → Integrations." Do NOT invent emails. Do NOT pretend you have access.]\n`;
        }
        if (gmailErrors.length > 0) {
          realDataContext += `\n\n[⚠️ Could not fetch emails from: ${gmailErrors.join("; ")}. Tell the user honestly. Do NOT invent emails.]\n`;
        }

        if (events.length > 0) {
          realDataContext += "\n\n--- REAL CALENDAR DATA (next 7 days) ---\n";
          events.forEach((e: any, i: number) => {
            realDataContext += `\n[Event ${i + 1}]
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
        } else if (calToken && !calendarError) {
          realDataContext += "\n\n[No calendar events scheduled for the next 7 days.]\n";
        }

        if (calendarError) {
          if (calendarNeedsReauth) {
            realDataContext += `\n\n[🔌 RECONNECT NEEDED: Google Calendar access expired. Tell the user: "I lost access to your calendar. Please reconnect via the plug icon → Integrations." Do NOT invent meetings.]\n`;
          } else {
            realDataContext += `\n\n[⚠️ Could not fetch calendar: ${calendarError}. Tell the user honestly. Do NOT invent meetings.]\n`;
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

        if (contacts.length > 0) {
          realDataContext += "\n\n--- CONTACT INTELLIGENCE (people the user knows) ---\n";
          contacts.forEach((c: any) => {
            const last = c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString() : "unknown";
            realDataContext += `• ${c.name}${c.is_vip ? " ⭐VIP" : ""} <${c.email || "no-email"}>${c.role ? ` — ${c.role}` : ""}${c.company ? ` @ ${c.company}` : ""} | last: ${last} (${c.interaction_count}x)${c.notes ? ` | notes: ${c.notes}` : ""}${c.last_interaction_summary ? ` | recent: ${c.last_interaction_summary}` : ""}\n`;
          });
          realDataContext += "--- END CONTACTS ---\n";
        }

        if (gmailAccounts.length === 0 && !calToken) {
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

## Core Capabilities
- Smart email triage, auto-draft replies, follow-up detection
- Conflict detection, meeting prep, smart scheduling
- Proactive flagging of overdue replies, back-to-back meetings, VIP contacts
${conversationMemoryNote}${realDataContext}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
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

    // For voice mode, tee the SSE stream so we can compute simple metrics
    // (sentence count + whether extended pacing was requested/produced) without
    // delaying the user-facing stream.
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
    // Network failure reaching the gateway
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
