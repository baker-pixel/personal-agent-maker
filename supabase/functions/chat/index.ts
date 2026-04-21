import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Token helpers ---
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

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

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
      .eq("user_id", userId)
      .eq("provider", provider);

    return data.access_token;
  } catch {
    return null;
  }
}

// --- Gmail fetch with timeout ---
async function fetchRecentEmails(accessToken: string, maxResults = 30) {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    // Pull last ~2 days so the agent can answer about earlier-today emails (lunch, morning, etc.)
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox newer_than:2d`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) { clearTimeout(timeoutId); return []; }

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
        };
      })
    );
    clearTimeout(timeoutId);
    return emails;
  } catch (e) {
    console.error("Gmail fetch error or timeout:", e);
    return [];
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
    const calData = await calRes.json();
    clearTimeout(timeoutId);
    if (calData.error) return [];

    return (calData.items || []).map((event: any) => ({
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
  } catch (e) {
    console.error("Calendar fetch error or timeout:", e);
    return [];
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, agentName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const now = new Date();
    const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
    const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
        const [gmailToken, calToken] = await Promise.all([
          getValidToken(user.id, "gmail"),
          getValidToken(user.id, "google-calendar"),
        ]);

        const adminForContacts = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const [emails, events, contactsRes] = await Promise.all([
          gmailToken ? fetchRecentEmails(gmailToken, 8) : [],
          calToken ? fetchEvents(calToken, 7) : [],
          adminForContacts
            .from("contacts")
            .select("name, email, company, role, notes, is_vip, last_interaction_at, last_interaction_summary, interaction_count")
            .eq("user_id", user.id)
            .order("is_vip", { ascending: false })
            .order("last_interaction_at", { ascending: false, nullsFirst: false })
            .limit(60),
        ]);

        const contacts = contactsRes.data || [];

        if (emails.length > 0) {
          realDataContext += "\n\n--- REAL INBOX DATA (from user's actual Gmail) ---\n";
          emails.forEach((e: any, i: number) => {
            realDataContext += `\n[Email ${i + 1}] ${e.isUnread ? "🔵 UNREAD" : ""}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Preview: ${e.snippet}\n`;
          });
          realDataContext += "\n--- END INBOX DATA ---\n";
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
        }

        if (contacts.length > 0) {
          realDataContext += "\n\n--- CONTACT INTELLIGENCE (people the user knows) ---\n";
          contacts.forEach((c: any) => {
            const last = c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString() : "unknown";
            realDataContext += `• ${c.name}${c.is_vip ? " ⭐VIP" : ""} <${c.email || "no-email"}>${c.role ? ` — ${c.role}` : ""}${c.company ? ` @ ${c.company}` : ""} | last: ${last} (${c.interaction_count}x)${c.notes ? ` | notes: ${c.notes}` : ""}${c.last_interaction_summary ? ` | recent: ${c.last_interaction_summary}` : ""}\n`;
          });
          realDataContext += "--- END CONTACTS ---\n";
        }

        if (!gmailToken && !calToken) {
          realDataContext += "\n\n[No accounts connected. If the user asks about emails or calendar, let them know they can connect via Integrations (plug icon in the top right).]\n";
        }
      }
    }

    const systemPrompt = `You are ${agentName || "Normy"}, an elite AI executive assistant. Today is ${today}, ${timeOfDay}.

## CRITICAL: Response Style — Be Concise by Default
- **ALWAYS reply in short, conversational text** — like a real human assistant texting you back. 2-4 sentences max for most replies.
- **NEVER dump full email contents, raw data, or long lists** unless the user explicitly asks for details (e.g., "show me the full email", "list all my emails", "give me the details").
- When referencing emails or meetings, mention them briefly by sender/subject — don't paste snippets or bodies.
- Example good reply: "You have 3 unread emails — one urgent from Sarah about the Q3 budget. Want me to draft a reply?"
- Example bad reply: listing out every email with From/Subject/Date/Preview fields.
- If the user asks "what's in my inbox?" give a brief summary with counts and highlights, NOT a full list.
- Only expand into detail when the user says things like "show me", "tell me more", "what does it say", "give me the full email", or "details".

## Data Relevance Rule
You have access to the user's real email and calendar data below. ONLY mention or reference this data when it is relevant to what the user is asking about. If the user asks a general question, makes small talk, or asks about something unrelated to emails/calendar, respond naturally WITHOUT bringing up their inbox or schedule. Do NOT volunteer email or calendar summaries unless the user asks about them or the context clearly calls for it.

## Your Identity
You are the user's trusted chief of staff — proactive, organized, and anticipatory. You don't just answer questions; you think ahead, flag risks, and take initiative. You behave like a real-life executive assistant who is always one step ahead.

## CRITICAL BEHAVIOR: Be Proactive Like a Real EA
- After EVERY response, end by proactively offering to handle the next thing — keep it to ONE line.
- When the user gives you a task, DO IT immediately and completely. Don't just explain what you could do — actually do it.
- Anticipate what the user needs next but keep suggestions brief.

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
- 📧 Smart email triage, auto-draft replies, follow-up detection, batch processing
- 📅 Conflict detection, meeting prep, smart scheduling, availability summaries
- 🔔 Proactive flagging of overdue replies, back-to-back meetings, VIP contacts

## Response Style
- Be concise and scannable. Short paragraphs, not walls of text.
- Use emoji sparingly for visual scanning: 📧 ✅ ⚠️ 📅 🔴
- For draft replies, use quote blocks so they're clearly distinguishable
- Sound like a real person, not a robot. Be warm but efficient.

## NEXT STEPS (CRITICAL)
At the end of EVERY response, include 2-3 brief action suggestions the user can say "yes" to. Keep them on one line each. Format as a simple list under "**Next Steps:**"

## DRAFT FORMAT
When you draft email replies, include a structured JSON block so the user can save them. Use this exact format after each draft:

\`\`\`draft-json
{"to_email": "recipient@example.com", "to_name": "Recipient Name", "subject": "Re: Subject line", "body": "Full plain text body of the draft"}
\`\`\`

Keep draft bodies concise and professional. Only show drafts when the user asks you to draft something.
${realDataContext}`;

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
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
