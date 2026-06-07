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

async function groqFetch(url: string, init: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok && retries > 0 && (res.status === 429 || res.status >= 500)) {
    const delay = res.status === 429 ? 2000 : 1000;
    await new Promise(r => setTimeout(r, delay));
    return groqFetch(url, init, retries - 1);
  }
  return res;
}

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

const TEXT_TOOLS = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a recipient on behalf of the user. Use when user asks to send, write, draft, or reply to an email.",
      parameters: {
        type: "object",
        properties: {
          to_email: { type: "string", description: "Recipient email address" },
          to_name: { type: "string", description: "Recipient display name (optional)" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body in plain text" },
          cc: { type: "string", description: "CC recipients comma-separated (optional)" },
          bcc: { type: "string", description: "BCC recipients comma-separated (optional)" },
          reply_to_message_id: { type: "string", description: "Nylas message ID to reply to (optional)" },
        },
        required: ["to_email", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new event on the user's Google Calendar and send invites to attendees.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          start: { type: "string", description: "ISO 8601 datetime in user's local timezone e.g. 2026-06-10T14:00:00" },
          end: { type: "string", description: "ISO 8601 datetime. Defaults to 1 hour after start if omitted." },
          description: { type: "string", description: "Event notes (optional)" },
          location: { type: "string", description: "Event location (optional)" },
          allDay: { type: "boolean", description: "True for all-day events (use date-only strings for start/end)" },
          attendees: {
            type: "array",
            description: "Attendees to invite",
            items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
          },
        },
        required: ["summary", "start"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update an existing calendar event. Only use eventId values from REAL CALENDAR DATA in the system prompt.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "Nylas event ID from REAL CALENDAR DATA" },
          summary: { type: "string", description: "Event title — required even if unchanged" },
          start: { type: "string", description: "New ISO 8601 start datetime (optional)" },
          end: { type: "string", description: "New ISO 8601 end datetime (optional)" },
          description: { type: "string", description: "Updated notes (optional)" },
          location: { type: "string", description: "Updated location (optional)" },
          attendees: {
            type: "array",
            items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] },
          },
          notifyAttendees: { type: "boolean", description: "Send update emails to attendees (default true)" },
        },
        required: ["eventId", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Cancel and delete a calendar event. Only use eventId values from REAL CALENDAR DATA.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "Nylas event ID from REAL CALENDAR DATA" },
          summary: { type: "string", description: "Event title for confirmation message" },
          notifyAttendees: { type: "boolean", description: "Send cancellation emails to attendees (default true)" },
        },
        required: ["eventId", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new action item / task for the user.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Details or context (optional)" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level (default medium)" },
          due_date: { type: "string", description: "ISO 8601 date e.g. 2026-06-10 (optional)" },
          assignee: { type: "string", description: "Who is responsible (optional, defaults to user)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_contact",
      description: "Save a new contact to the user's contact list.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name" },
          email: { type: "string", description: "Email address (optional)" },
          phone: { type: "string", description: "Phone number (optional)" },
          company: { type: "string", description: "Company name (optional)" },
          role: { type: "string", description: "Job title (optional)" },
          notes: { type: "string", description: "Additional notes (optional)" },
          is_vip: { type: "boolean", description: "Mark as VIP (default false)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_email",
      description: "Move an email to trash. Only use messageId values from the ID field in REAL INBOX DATA — never invent one.",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "Nylas message ID from the ID field in REAL INBOX DATA" },
          subject: { type: "string", description: "Email subject for confirmation message" },
        },
        required: ["messageId", "subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_contact",
      description: "Permanently delete a contact from the contact list. Only use contactId from the id field in CONTACT INTELLIGENCE data — never invent one.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact database ID from the id field in CONTACT INTELLIGENCE" },
          name: { type: "string", description: "Contact name for confirmation message" },
        },
        required: ["contactId", "name"],
      },
    },
  },
];

interface ToolExecutionContext {
  userId: string;
  grantId: string | null;
  nylasApiKey: string;
  adminClient: any;
}

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  ctx: ToolExecutionContext
): Promise<{ success: boolean; message: string; data?: any }> {
  const { userId, grantId, nylasApiKey, adminClient } = ctx;

  if (name !== "save_contact" && !grantId) {
    return { success: false, message: "Google account not connected. Please reconnect via Integrations." };
  }

  try {
    if (name === "send_email") {
      const { data: prefs } = await adminClient
        .from("user_preferences")
        .select("email_signature")
        .eq("user_id", userId)
        .maybeSingle();
      const sig = (prefs?.email_signature || "").trim();
      const fullBody = sig ? `${args.body}\n\n${sig}` : args.body;

      const toList = args.to_name
        ? [{ name: args.to_name, email: args.to_email }]
        : [{ email: args.to_email }];

      const parseAddr = (raw: string) =>
        raw.split(",").map((s: string) => s.trim()).filter(Boolean).map((r: string) => {
          const m = r.match(/^(.+?)\s*<([^>]+)>$/);
          return m ? { name: m[1].trim(), email: m[2].trim() } : { email: r };
        });

      const payload: Record<string, any> = { subject: args.subject, body: fullBody, to: toList };
      if (args.cc) payload.cc = parseAddr(args.cc);
      if (args.bcc) payload.bcc = parseAddr(args.bcc);
      if (args.reply_to_message_id) payload.reply_to_message_id = args.reply_to_message_id;

      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return { success: false, message: "Gmail session expired. User needs to reconnect via Integrations." };
        return { success: false, message: data.message || "Failed to send email" };
      }

      await adminClient.from("draft_actions").insert({
        user_id: userId,
        type: "email_compose",
        status: "sent",
        to_email: args.to_email,
        subject: args.subject,
        body: fullBody,
        gmail_message_id: data.data?.id || null,
        updated_at: new Date().toISOString(),
      }).catch(() => {/* non-critical */});

      return { success: true, message: `Email sent to ${args.to_name || args.to_email}`, data: { messageId: data.data?.id } };
    }

    if (name === "create_calendar_event") {
      let when: Record<string, any>;
      if (args.allDay) {
        const endDate = args.end || (() => {
          const d = new Date((args.start as string) + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        when = { object: "datespan", start_date: args.start, end_date: endDate };
      } else {
        const startUnix = Math.floor(new Date(args.start).getTime() / 1000);
        const endIso = args.end || new Date(new Date(args.start).getTime() + 3600000).toISOString();
        const endUnix = Math.floor(new Date(endIso).getTime() / 1000);
        when = { object: "timespan", start_time: startUnix, end_time: endUnix };
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validAttendees = (args.attendees || []).filter((a: any) => emailRe.test(a.email || ""));
      const eventBody: Record<string, any> = { title: args.summary, when };
      if (args.description) eventBody.description = args.description;
      if (args.location) eventBody.location = args.location;
      if (validAttendees.length > 0) {
        eventBody.participants = validAttendees.map((a: any) => ({
          email: a.email, ...(a.name ? { name: a.name } : {}), status: "noreply",
        }));
      }

      const qs = validAttendees.length > 0 ? "&notify_participants=true" : "";
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events?calendar_id=primary${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return { success: false, message: "Google Calendar session expired. User needs to reconnect." };
        return { success: false, message: data.message || data.error || "Failed to create event" };
      }
      const inviteNote = validAttendees.length > 0
        ? ` — invites sent to ${validAttendees.map((a: any) => a.name || a.email).join(", ")}`
        : "";
      return {
        success: true,
        message: `Event "${args.summary}" created on Google Calendar${inviteNote}`,
        data: { eventId: data.data?.id, htmlLink: data.data?.html_link },
      };
    }

    if (name === "update_calendar_event") {
      const updateBody: Record<string, any> = { title: args.summary };
      if (args.start) {
        const startUnix = Math.floor(new Date(args.start).getTime() / 1000);
        const endIso = args.end || new Date(new Date(args.start).getTime() + 3600000).toISOString();
        updateBody.when = { object: "timespan", start_time: startUnix, end_time: Math.floor(new Date(endIso).getTime() / 1000) };
      }
      if (args.description !== undefined) updateBody.description = args.description;
      if (args.location !== undefined) updateBody.location = args.location;
      if (args.attendees) {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const valid = args.attendees.filter((a: any) => emailRe.test(a.email || ""));
        if (valid.length > 0) updateBody.participants = valid.map((a: any) => ({ email: a.email, ...(a.name ? { name: a.name } : {}), status: "noreply" }));
      }

      const qs = args.notifyAttendees !== false ? "?notify_participants=true" : "";
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events/${args.eventId}${qs}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return { success: false, message: "Google Calendar session expired." };
        if (res.status === 404) return { success: false, message: `Event "${args.summary}" not found — it may have been deleted.` };
        return { success: false, message: data.message || data.error || "Failed to update event" };
      }
      return { success: true, message: `Event "${args.summary}" updated on Google Calendar`, data: { htmlLink: data.data?.html_link } };
    }

    if (name === "delete_calendar_event") {
      const qs = args.notifyAttendees !== false ? "?notify_participants=true" : "";
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events/${args.eventId}${qs}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return { success: false, message: "Google Calendar session expired." };
        if (res.status === 404) return { success: false, message: `Event "${args.summary}" not found.` };
        return { success: false, message: (data as any).message || "Failed to delete event" };
      }
      return { success: true, message: `Event "${args.summary}" cancelled${args.notifyAttendees !== false ? " — attendees notified" : ""}` };
    }

    if (name === "create_task") {
      const { error } = await adminClient.from("action_items").insert({
        user_id: userId,
        title: args.title,
        description: args.description || null,
        priority: args.priority || "medium",
        status: "open",
        due_date: args.due_date || null,
        assignee: args.assignee || null,
        source: "assistant",
      });
      if (error) return { success: false, message: error.message || "Failed to create task" };
      const due = args.due_date ? ` due ${args.due_date}` : "";
      return { success: true, message: `Task "${args.title}" created${due}` };
    }

    if (name === "save_contact") {
      const { error } = await adminClient.from("contacts").insert({
        user_id: userId,
        name: args.name,
        email: args.email || null,
        phone: args.phone || null,
        company: args.company || null,
        role: args.role || null,
        notes: args.notes || null,
        is_vip: args.is_vip || false,
      });
      if (error) return { success: false, message: error.message || "Failed to save contact" };
      return { success: true, message: `Contact "${args.name}" saved` };
    }

    if (name === "delete_email") {
      if (!grantId) return { success: false, message: "Google account not connected. Please reconnect via Integrations." };
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/${args.messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return { success: false, message: "Gmail session expired. Please reconnect via Integrations." };
        if (res.status === 404) return { success: false, message: `Email "${args.subject}" not found — it may have already been deleted.` };
        return { success: false, message: (data as any).message || "Failed to delete email" };
      }
      return { success: true, message: `Email "${args.subject}" moved to trash` };
    }

    if (name === "delete_contact") {
      const { error } = await adminClient
        .from("contacts")
        .delete()
        .eq("id", args.contactId)
        .eq("user_id", userId);
      if (error) return { success: false, message: error.message || "Failed to delete contact" };
      return { success: true, message: `Contact "${args.name}" deleted` };
    }

    return { success: false, message: `Unknown tool: ${name}` };
  } catch (err: any) {
    console.error(`[tool:${name}] error:`, err);
    return { success: false, message: err.message || "Tool execution failed" };
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
    let userDisplayName = "";
    const authHeader = req.headers.get("Authorization");

    // Variables hoisted for tool-calling access after auth block
    let authedUser: any = null;
    let authedAdminClient: any = null;
    let authedPrimaryGrant: { grantId: string; email: string } | null = null;

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
        // Hoist to outer scope for tool-calling access
        authedUser = user;
        authedAdminClient = adminForContacts;
        authedPrimaryGrant = primaryGrant;
        // User's own email for test email / self-send scenarios
        const userOwnEmail = primaryGrant?.email || user.email || "";

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
          triagedEmailsRes,
          pendingDraftsRes,
          followUpRes,
          userPrefsRes,
        ] = await Promise.all([
          canFetchNylas && nylasGrants.length > 0
            ? Promise.all(nylasGrants.map((g) => fetchRecentEmails(g.grantId, nylasApiKey, 8, g.email)))
            : Promise.resolve([]),
          canFetchNylas && primaryGrant ? fetchEvents(primaryGrant.grantId, nylasApiKey, 7) : Promise.resolve({ events: [], error: null }),
          adminForContacts
            .from("contacts")
            .select("id, name, email, company, role, notes, is_vip, last_interaction_at, last_interaction_summary, interaction_count, ai_summary, ai_topics, birthday")
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
          // AI-triaged inbox state
          adminForContacts
            .from("email_metadata")
            .select("from_name, from_address, subject, received_at, category, priority_score, ai_summary, ai_reason, replied_at, snoozed_until, is_unread")
            .eq("user_id", user.id)
            .gte("received_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
            .is("replied_at", null)
            .or(`snoozed_until.is.null,snoozed_until.lte.${now.toISOString()}`)
            .in("category", ["urgent", "needs_reply"])
            .order("priority_score", { ascending: false })
            .limit(20),
          // Pending draft approvals
          adminForContacts
            .from("draft_actions")
            .select("to_email, to_name, subject, body, created_at")
            .eq("user_id", user.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(5),
          // Follow-up candidates: replied 48h+ ago, may not have gotten a response
          adminForContacts
            .from("email_metadata")
            .select("from_name, from_address, subject, replied_at")
            .eq("user_id", user.id)
            .not("replied_at", "is", null)
            .lt("replied_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
            .gte("replied_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order("replied_at", { ascending: false })
            .limit(8),
          adminForContacts
            .from("user_preferences")
            .select("user_display_name")
            .eq("user_id", user.id)
            .maybeSingle(),
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
        const triagedEmails: any[] = (triagedEmailsRes as any)?.data || [];
        const pendingDrafts: any[] = (pendingDraftsRes as any)?.data || [];
        const followUps: any[] = (followUpRes as any)?.data || [];
        userDisplayName = ((userPrefsRes as any)?.data?.user_display_name || "").trim();

        // "Right now" context from calendar events already fetched
        const nowTs = now.getTime();
        const currentEvent = events.find((e: any) => {
          try { return new Date(e.start).getTime() <= nowTs && new Date(e.end).getTime() > nowTs; } catch { return false; }
        });
        const nextEvent = events.find((e: any) => {
          try { return new Date(e.start).getTime() > nowTs; } catch { return false; }
        });
        const minsUntilNext = nextEvent
          ? Math.round((new Date(nextEvent.start).getTime() - nowTs) / 60000)
          : null;

        // Inject user's own email so agent can use it for test/self-send
        if (userOwnEmail) {
          realDataContext += `\n\n--- LOGGED-IN USER ---\nEmail: ${userOwnEmail}\nUse this email when the user says "send me a test email", "email myself", "send to myself", or similar.\n--- END LOGGED-IN USER ---\n`;
        }

        if (allEmails.length > 0) {
          const accountNote = nylasGrants.length > 1 ? ` (across ${nylasGrants.length} connected accounts)` : "";
          realDataContext += `\n\n--- REAL INBOX DATA${accountNote} ---\n`;
          allEmails.slice(0, 16).forEach((e: any, i: number) => {
            realDataContext += `\n[Email ${i + 1}] ${e.isUnread ? "🔵 UNREAD" : ""}${nylasGrants.length > 1 ? ` [${e.account}]` : ""}
ID: ${e.id}
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

        // ─── RIGHT NOW context ────────────────────────────────────────────────
        {
          const todayDate = new Date(now);
          const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,"0")}-${String(todayDate.getDate()).padStart(2,"0")}`;
          const todayEvents = events.filter((e: any) => {
            try { return e.start?.startsWith(todayStr); } catch { return false; }
          });
          const overdueCount = actionItems.filter((a: any) => a.due_date && a.due_date < todayStr).length;
          const dueTodayCount = actionItems.filter((a: any) => a.due_date === todayStr).length;

          realDataContext += "\n\n--- RIGHT NOW (user's current situation) ---\n";
          if (currentEvent) {
            realDataContext += `🟢 CURRENTLY IN MEETING: "${currentEvent.summary}" (ends ${new Date(currentEvent.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})\n`;
          } else if (nextEvent && minsUntilNext !== null) {
            if (minsUntilNext <= 30) {
              realDataContext += `🟡 MEETING STARTING SOON: "${nextEvent.summary}" in ${minsUntilNext} minute${minsUntilNext === 1 ? "" : "s"}\n`;
            } else {
              realDataContext += `⏰ Next meeting: "${nextEvent.summary}" in ${minsUntilNext} minutes\n`;
            }
          } else {
            realDataContext += `📅 No upcoming meetings today\n`;
          }
          if (todayEvents.length > 0) {
            realDataContext += `📅 Today's meetings: ${todayEvents.length} total\n`;
          }
          if (overdueCount > 0) realDataContext += `⚠️ Overdue tasks: ${overdueCount}\n`;
          if (dueTodayCount > 0) realDataContext += `📋 Tasks due today: ${dueTodayCount}\n`;
          realDataContext += "--- END RIGHT NOW ---\n";
        }

        // ─── AI-triaged inbox state ───────────────────────────────────────────
        if (triagedEmails.length > 0) {
          const urgent = triagedEmails.filter((e: any) => e.category === "urgent");
          const needsReply = triagedEmails.filter((e: any) => e.category === "needs_reply");

          realDataContext += "\n\n--- AI-TRIAGED INBOX (categorized emails awaiting action) ---\n";
          realDataContext += "These emails have been analyzed by AI and categorized. Use these instead of the raw INBOX DATA when answering questions about email priorities.\n";

          if (urgent.length > 0) {
            realDataContext += `\nURGENT (${urgent.length} requiring immediate action):\n`;
            urgent.forEach((e: any) => {
              const score = e.priority_score ? ` [P${e.priority_score}]` : "";
              const unread = e.is_unread ? " 🔵" : "";
              realDataContext += `•${score}${unread} From: ${e.from_name || e.from_address} | Subject: "${e.subject || "(no subject)"}" | ${e.ai_summary || ""}\n`;
              if (e.ai_reason) realDataContext += `  Why urgent: ${e.ai_reason}\n`;
            });
          }

          if (needsReply.length > 0) {
            realDataContext += `\nNEEDS REPLY (${needsReply.length} awaiting your response):\n`;
            needsReply.slice(0, 8).forEach((e: any) => {
              const score = e.priority_score ? ` [P${e.priority_score}]` : "";
              realDataContext += `•${score} From: ${e.from_name || e.from_address} | Subject: "${e.subject || "(no subject)"}" | ${e.ai_summary || ""}\n`;
            });
          }

          realDataContext += "\n--- END AI-TRIAGED INBOX ---\n";
        }

        // ─── Pending draft approvals ──────────────────────────────────────────
        if (pendingDrafts.length > 0) {
          realDataContext += "\n\n--- DRAFTS WAITING FOR APPROVAL ---\n";
          realDataContext += "These AI-generated email drafts are in the user's Approval Inbox, waiting to be sent. Mention them if relevant.\n";
          pendingDrafts.forEach((d: any) => {
            realDataContext += `• To: ${d.to_name || d.to_email} | Subject: "${d.subject}" | Created: ${new Date(d.created_at).toLocaleString()}\n`;
          });
          realDataContext += "--- END DRAFTS ---\n";
        }

        // ─── Follow-up tracker ────────────────────────────────────────────────
        if (followUps.length > 0) {
          realDataContext += "\n\n--- FOLLOW-UP NEEDED (you replied, no response yet) ---\n";
          realDataContext += "You replied to these emails 48+ hours ago and haven't heard back. Surface these when the user asks about follow-ups or what needs attention.\n";
          followUps.forEach((e: any) => {
            const daysAgo = Math.floor((nowTs - new Date(e.replied_at).getTime()) / 86400000);
            realDataContext += `• You replied to ${e.from_name || e.from_address} about "${e.subject}" ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago — no response yet\n`;
          });
          realDataContext += "--- END FOLLOW-UPS ---\n";
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
            realDataContext += `• ${c.name}${c.is_vip ? " ⭐VIP" : ""} <${c.email || "no-email"}>${c.role ? ` — ${c.role}` : ""}${c.company ? ` @ ${c.company}` : ""} | id: ${c.id} | last: ${last} (${c.interaction_count}x)${c.notes ? ` | notes: ${c.notes}` : ""}${c.last_interaction_summary ? ` | recent: ${c.last_interaction_summary}` : ""}${aiBrief}${topics}${bday}\n`;
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
        realDataContext += "The user has a Tasks page at /tasks for managing action items (open + completed, with priorities, due dates, assignees). The OPEN ACTION ITEMS section above is the live list. When the user asks 'what's on my list', 'what do I need to do', 'what's overdue', reference that data directly. When they say 'add a task', 'remind me to', 'note that', or 'put that on my list' — call create_task immediately. When asked to 'find tasks I owe people' or 'what did I commit to', scan recent emails in REAL INBOX DATA for implicit commitments and suggest they hit 'Scan inbox for tasks' on the /tasks page for an AI sweep.\n";
        realDataContext += "--- END TASKS ---\n";

        if (!canFetchNylas && nylasGrants.length > 0) {
          realDataContext += "\n\n[Email and calendar are connected but temporarily unavailable due to a backend configuration issue. Do NOT tell the user to reconnect — their connection is fine. Just say email data isn't available right now and you'll check again shortly.]\n";
        } else if (nylasGrants.length === 0) {
          realDataContext += "\n\n[No Google accounts connected. If the user asks about emails or calendar, let them know they can connect via Integrations (plug icon in the top right).]\n";
        }
      }
    }

    const systemPrompt = `You are ${agentName || "Normy"}, an elite AI executive assistant. Today is ${today}. The user's local time right now is ${currentTimeStr} (${tz}) — it is ${timeOfDay}. ALWAYS reason about dates and times relative to this local time, never UTC.
${userDisplayName ? `\nThe user's preferred name is "${userDisplayName}". Always refer to them by this name (e.g., "Good ${timeOfDay}, ${userDisplayName}!", "Here's what's on your plate today, ${userDisplayName}"). Never use their email address as a name.\n` : ""}

## YOUR LIVE AWARENESS
You have real-time access to the user's:
- **AI-triaged inbox**: emails categorized as Urgent / Needs Reply with priority scores and AI summaries — use these when answering "what emails need attention?"
- **Right now status**: whether they're currently in a meeting or when their next one starts — greet them accordingly ("since you're about to head into a meeting...")
- **Follow-ups**: emails they sent 48h+ ago with no response — proactively surface these when asked about priorities
- **Pending drafts**: AI-generated replies waiting for their approval
- **Action items + tasks**: what's overdue and due today
Always use this live context to give specific, actionable answers — never say "I don't have access to your data."

${isVoice ? `
## VOICE MODE — CRITICAL
You are speaking out loud through TTS. Sound like a real human EA on the phone — NOT a memo being read.
- **NO bullet points. NO headers. NO "Next Steps:" labels. NO emojis. NO markdown.** Ever. Spoken speech only.
- Use natural spoken English with contractions ("you've", "I'll", "let's"). Never read raw data, ISO dates, or URLs aloud — reference them naturally ("Sarah's email about the budget", "your 3 PM with Jay").

### Pacing — match length to the request
**Default (normal questions, status checks, quick asks): 1-2 short sentences, then one natural follow-up question.**
- Examples: "What's on my calendar?", "Any urgent emails?", "Did Sarah reply?"
- Mention the most important item and offer more ("There's an urgent one from Sarah — want the rest?"). End with one question like "Want me to draft that?" or "Anything else?".

**Extended (only when the user explicitly asks for depth): up to ~6 sentences, still no lists or markdown.**
- Trigger phrases: "tell me more", "give me the details", "walk me through", "explain", "read it to me", "the full thing", "everything", "in depth", "summarize the whole…", "what did they say exactly".
- Speak it as a flowing paragraph — connect items with "also", "then", "and the last one". Still end with one short follow-up question.
- If the user asks to read an email/doc verbatim, you may go longer, but paraphrase formatting (no "Subject colon…").

When in doubt, stay short and offer more. Never volunteer a long answer the user didn't ask for.

### VOICE ACTIONS — EMAIL, CALENDAR, CONTACTS

Your tools execute immediately — no "confirm" step needed. Call the tool, then confirm in 1 spoken sentence. **NEVER output function tags, XML tags, or JSON in your spoken response — plain speech only.**

**EMAIL:** call send_email → say e.g. "Done — sent that to Sarah. Anything else?"
**DELETE EMAIL:** call delete_email (use ID from REAL INBOX DATA) → say e.g. "Done — moved that to trash."
**CALENDAR:** call create/update/delete tool → say e.g. "Done — your 3pm is set. Anything else?"
**CONTACTS:** call save_contact → say e.g. "Done — Jay's saved. Anything else?"
**DELETE CONTACT:** call delete_contact (use id from CONTACT INTELLIGENCE) → say e.g. "Done — contact removed."
**TASKS:** call create_task → say e.g. "Done — added that to your tasks. Anything else?"

If you can't resolve someone's email, say "I don't have their email — what is it?" and wait before calling the tool.
` : `
## RESPONSE STYLE — CONCISE BY DEFAULT
- Reply in short, conversational text — 2-4 sentences max for most replies.
- NEVER dump full email contents, raw data, or long lists unless the user explicitly asks.
- Brief summary: mention sender/subject, not full content.
- Expand only when user says "show me", "tell me more", "what does it say", "details", etc.

## TOOLS — USE THEM DIRECTLY (NO CONFIRMATION NEEDED)
You have tools: **send_email**, **delete_email**, **create_calendar_event**, **update_calendar_event**, **delete_calendar_event**, **save_contact**, **delete_contact**, **create_task**.

**CRITICAL: NEVER output tool call syntax, function tags, XML tags, or JSON payloads in your text response.** Never write angle-bracket function tags or raw JSON in your message. Your response must be plain natural language only. Tools are called silently by the system — you just confirm in words after.

When the user asks to take an action, call the appropriate tool immediately — do not ask for confirmation, do not describe what you're about to do, just call it. After the tool executes, confirm in one short sentence ("Done — email sent to Sarah. Anything else?").

**send_email rules:**
- Use when user asks to send/write/draft/reply to an email.
- Resolve recipient from PEOPLE DIRECTORY or LOGGED-IN USER. If no match found, ask for their email — NEVER fabricate one.
- Always write a real subject and body. Never leave them blank.
- For "send me a test email" / "email myself" — use the LOGGED-IN USER email as to_email.

**create_calendar_event rules:**
- Use when user asks to schedule/add/create an event.
- Always include attendees array (empty [] if no guests) when user mentions inviting someone.
- Infer the date from context (today is set in the system). "Tomorrow at 3pm" → compute the correct ISO date.
- start/end must be ISO 8601 in the user's local timezone (e.g. "2026-06-10T14:00:00").

**update_calendar_event rules:**
- eventId MUST come from REAL CALENDAR DATA in this prompt. Never invent one.
- If event not found in REAL CALENDAR DATA, tell user you can't see it.

**delete_calendar_event rules:**
- eventId MUST come from REAL CALENDAR DATA. Never invent one.

**delete_email rules:**
- messageId MUST come from the ID field in REAL INBOX DATA above. Never invent one.
- If the email is not in REAL INBOX DATA, tell the user you can't see it in the recent inbox.

**save_contact rules:**
- Check PEOPLE DIRECTORY first — if they're already there, say so instead of saving again.
- Never fabricate or guess an email address.

**delete_contact rules:**
- contactId MUST come from the id field in CONTACT INTELLIGENCE above. Never invent one.
- If the contact is not in CONTACT INTELLIGENCE, tell the user you can't find them.

## NEXT STEPS (CRITICAL)
At the end of EVERY response, include 2-3 brief action suggestions the user can say "yes" to. One line each. Simple list under "**Next Steps:**"
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
   Wait for the user's reply before taking any action. Do NOT call any tool in the disambiguation turn. If the user replies with another partial ("the one at Acme", "Niblick", "the CEO"), re-match against the candidate list and proceed once exactly one remains.
6. **If no match → ask for the email.** Say so honestly. Do NOT guess or fabricate an email like "jay.niblick@example.com".
7. When you have resolved exactly one match, use their email in the tool call (send_email or create_calendar_event).


## Core Capabilities
- Smart email triage, auto-draft replies, follow-up detection
- Conflict detection, meeting prep, smart scheduling
- Proactive flagging of overdue replies, back-to-back meetings, VIP contacts
${conversationMemoryNote}${realDataContext}`;


    // ---- AGENTIC TOOL LOOP (text + voice) ----
    // Loops until the model stops calling tools or hits MAX_ROUNDS.
    // Handles bulk ops: OOO replies, sending to N people, chained tasks, etc.
    {
      const toolCtx: ToolExecutionContext = {
        userId: authedUser?.id ?? "",
        grantId: authedPrimaryGrant?.grantId ?? null,
        nylasApiKey,
        adminClient: authedAdminClient,
      };

      const loopMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...effectiveMessages,
      ];

      const MAX_ROUNDS = 10;
      let rounds = 0;
      let finalContent: string | null = null;

      while (rounds < MAX_ROUNDS) {
        rounds++;

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: loopMessages,
            tools: TEXT_TOOLS,
            tool_choice: "auto",
            stream: false,
          }),
        });

        if (!res.ok) {
          if (res.status === 429) return new Response(
            JSON.stringify({ error: "I'm getting too many requests right now — give me a moment and try again." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
          if (res.status === 402) return new Response(
            JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage to keep chatting." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
          const errText = await res.text().catch(() => "");
          console.error(`[chat] loop round ${rounds} error:`, res.status, errText);
          return new Response(
            JSON.stringify({ error: "AI service returned an error. Please try again." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        const finishReason: string = choice?.finish_reason ?? "stop";

        if (finishReason !== "tool_calls") {
          // Model is done — capture final text and exit loop
          finalContent = choice?.message?.content ?? "";
          break;
        }

        const toolCalls: any[] = choice.message.tool_calls || [];
        console.log(`[chat] round ${rounds} tool_calls: ${toolCalls.map((tc: any) => tc.function.name).join(", ")}`);

        const toolResults = await Promise.all(
          toolCalls.map(async (tc: any) => {
            let args: Record<string, any> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
            const result = await executeToolCall(tc.function.name, args, toolCtx);
            console.log(`[tool:${tc.function.name}] round=${rounds} result: ${JSON.stringify(result)}`);
            return { role: "tool" as const, tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );

        // Append this round's assistant message + tool results for next iteration
        loopMessages.push(choice.message, ...toolResults);
      }

      // Helper: return a streaming response with optional voice metrics tee
      const streamingResponse = async (messages: any[]) => {
        const streamRes = await groqFetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, stream: true }),
        });
        if (!streamRes.ok) {
          const errText = await streamRes.text().catch(() => "");
          console.error("[chat] final stream error:", streamRes.status, errText);
          return new Response(
            JSON.stringify({ error: "AI service returned an error. Please try again." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (isVoice && streamRes.body) {
          const lastUserMsg = [...effectiveMessages].reverse().find((m: any) => m?.role === "user");
          const userText: string = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
          const EXTENDED_TRIGGERS = /\b(tell me more|more detail|details?|walk me through|explain|read it (to me|aloud)|the full thing|everything|in depth|in-depth|summari[sz]e the whole|what did they say exactly|go deeper|elaborate|long(er)? version)\b/i;
          const userRequestedExtended = EXTENDED_TRIGGERS.test(userText);
          const [clientStream, metricsStream] = streamRes.body.tee();
          (async () => {
            try {
              const reader = metricsStream.getReader();
              const decoder = new TextDecoder();
              let buffer = "", assistantText = "";
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
                    const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
                    if (typeof delta === "string") assistantText += delta;
                  } catch { /* ignore */ }
                }
              }
              const sentences = assistantText.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.length > 1);
              const extendedProduced = sentences.length > 2;
              console.log(`[voice-metrics] ${JSON.stringify({ sentences: sentences.length, words: assistantText.trim().split(/\s+/).filter(Boolean).length, userRequestedExtended, extendedProduced, triggerMatch: extendedProduced === userRequestedExtended ? "ok" : userRequestedExtended ? "missed-extended" : "over-extended", userPreview: userText.slice(0, 80) })}`);
            } catch (err) { console.error("[voice-metrics] failed:", err); }
          })();
          return new Response(clientStream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
        }
        return new Response(streamRes.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
      };

      // If loop hit MAX_ROUNDS without a stop, ask the model to summarise what it did
      if (finalContent === null) {
        console.log(`[chat] hit MAX_ROUNDS=${MAX_ROUNDS}, requesting summary`);
        return streamingResponse(loopMessages);
      }

      // Model gave a final text response — emit as word-chunked SSE
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const words = finalContent!.split(/(\s+)/);
          for (const chunk of words) {
            if (!chunk) continue;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk }, finish_reason: null }] })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }
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
