// Executes a single agent tool call on behalf of the Nova Sonic voice server.
// Auth: end-user JWT in Authorization header (same as chat). Handlers are a
// 1:1 port of executeToolCall in chat/index.ts — keep the two in sync until
// they are extracted into _shared/.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null } | null> {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "valid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) return null;
  return { grantId: grant.grant_id, email: grant.email };
}

function tzOffsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour) % 24, Number(map.minute), Number(map.second),
  );
  return asUtc - ts;
}

function parseLocalIsoMs(iso: string, timeZone: string): number {
  // Strip trailing Z — Nova (and Llama) sometimes appends Z even when instructed
  // to emit local time, which would misinterpret the wall-clock hour as UTC.
  const stripped = iso.replace(/Z$/i, "");
  if (/[+-]\d{2}:?\d{2}$/.test(stripped)) return Date.parse(stripped);
  const utcGuess = Date.parse(stripped.includes("T") ? `${stripped}Z` : `${stripped}T00:00:00Z`);
  let ts = utcGuess - tzOffsetMs(utcGuess, timeZone);
  ts = utcGuess - tzOffsetMs(ts, timeZone);
  return ts;
}

interface ToolExecutionContext {
  userId: string;
  grantId: string | null;
  nylasApiKey: string;
  adminClient: any;
  tz: string;
}

function requiresGoogleGrant(name: string): boolean {
  return !["save_contact", "create_task", "delete_contact"].includes(name);
}

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  ctx: ToolExecutionContext
): Promise<{ success: boolean; message: string; data?: any }> {
  const { userId, grantId, nylasApiKey, adminClient, tz } = ctx;

  if (requiresGoogleGrant(name) && !grantId) {
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
        if (res.status === 401) return { success: false, message: "Email connection expired. User needs to reconnect via Integrations." };
        return { success: false, message: data.message || "Failed to send email" };
      }

      try {
        await adminClient.from("draft_actions").insert({
          user_id: userId,
          type: "email_compose",
          status: "sent",
          to_email: args.to_email,
          subject: args.subject,
          body: fullBody,
          gmail_message_id: data.data?.id || null,
          updated_at: new Date().toISOString(),
        });
      } catch (_) { /* non-critical bookkeeping — email already sent */ }

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
        const startMs = parseLocalIsoMs(args.start as string, tz);
        const endMs = args.end ? parseLocalIsoMs(args.end as string, tz) : startMs + 3600000;
        when = { object: "timespan", start_time: Math.floor(startMs / 1000), end_time: Math.floor(endMs / 1000) };
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
        if (res.status === 401) return { success: false, message: "Calendar connection expired. User needs to reconnect via Integrations." };
        return { success: false, message: data.message || data.error || "Failed to create event" };
      }
      const inviteNote = validAttendees.length > 0
        ? ` — invites sent to ${validAttendees.map((a: any) => a.name || a.email).join(", ")}`
        : "";
      return {
        success: true,
        message: `Event "${args.summary}" created on the calendar${inviteNote}`,
        data: { eventId: data.data?.id, htmlLink: data.data?.html_link },
      };
    }

    if (name === "update_calendar_event") {
      const updateBody: Record<string, any> = { title: args.summary };
      if (args.start) {
        const startMs = parseLocalIsoMs(args.start as string, tz);
        const endMs = args.end ? parseLocalIsoMs(args.end as string, tz) : startMs + 3600000;
        updateBody.when = { object: "timespan", start_time: Math.floor(startMs / 1000), end_time: Math.floor(endMs / 1000) };
      }
      if (args.description !== undefined) updateBody.description = args.description;
      if (args.location !== undefined) updateBody.location = args.location;
      if (args.attendees) {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const valid = args.attendees.filter((a: any) => emailRe.test(a.email || ""));
        if (valid.length > 0) updateBody.participants = valid.map((a: any) => ({ email: a.email, ...(a.name ? { name: a.name } : {}), status: "noreply" }));
      }

      const notify = args.notifyAttendees !== false ? "true" : "false";
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events/${args.eventId}?calendar_id=primary&notify_participants=${notify}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${nylasApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return { success: false, message: "Calendar connection expired. User needs to reconnect via Integrations." };
        if (res.status === 404) return { success: false, message: `Event "${args.summary}" not found — it may have been deleted.` };
        return { success: false, message: data.message || data.error || "Failed to update event" };
      }
      return { success: true, message: `Event "${args.summary}" updated on the calendar`, data: { htmlLink: data.data?.html_link } };
    }

    if (name === "delete_calendar_event") {
      const notify = args.notifyAttendees !== false ? "true" : "false";
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/events/${args.eventId}?calendar_id=primary&notify_participants=${notify}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return { success: false, message: "Calendar connection expired. User needs to reconnect via Integrations." };
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

    if (name === "read_email") {
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/${args.messageId}`, {
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (!res.ok) {
        if (res.status === 401) return { success: false, message: "Email connection expired. Please reconnect via Integrations." };
        if (res.status === 404) return { success: false, message: "That email was not found — it may have been deleted." };
        return { success: false, message: "Could not fetch the email right now." };
      }
      const data = await res.json();
      const msg = data.data || {};
      // Nylas returns HTML — strip to plain text for a voice readout
      const text = String(msg.body || msg.snippet || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);
      const from = (msg.from || [])[0];
      return {
        success: true,
        message: `Email from ${from?.name || from?.email || "unknown"}, subject "${msg.subject || ""}": ${text || "(no readable content)"}`,
      };
    }

    if (name === "delete_email") {
      if (!grantId) return { success: false, message: "Google account not connected. Please reconnect via Integrations." };
      const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/${args.messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) return { success: false, message: "Email connection expired. Please reconnect via Integrations." };
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
    console.error(`[voice-tool:${name}] error:`, err);
    return { success: false, message: err.message || "Tool execution failed" };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: "Missing authorization" }), {
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
      return new Response(JSON.stringify({ success: false, message: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, args, tz } = await req.json();
    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ success: false, message: "Missing tool name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const grant = await getNylasGrant(adminClient, user.id);
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY") ?? "";

    const result = await executeToolCall(name, args ?? {}, {
      userId: user.id,
      grantId: grant?.grantId ?? null,
      nylasApiKey,
      adminClient,
      tz: (typeof tz === "string" && tz) || "UTC",
    });

    console.log(`[voice-tools] ${user.id} ${name} -> ${result.success ? "ok" : `fail: ${result.message}`}`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[voice-tools] error:", err);
    return new Response(JSON.stringify({ success: false, message: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
