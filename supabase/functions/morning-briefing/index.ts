import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


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

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null } | null> {
  try {
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
  } catch {
    return null;
  }
}

async function fetchEmails(grantId: string, nylasApiKey: string) {
  // Fetch unread emails from last 1 day
  const receivedAfter = Math.floor((Date.now() - 1 * 24 * 60 * 60 * 1000) / 1000);
  const params = new URLSearchParams({
    limit: "15",
    in: "INBOX",
    received_after: String(receivedAfter),
  });
  const listRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const messages: any[] = listData.data || [];
  if (!messages.length) return [];

  return messages.slice(0, 15).map((msg: any) => ({
    id: msg.id,
    snippet: msg.snippet || "",
    from: formatAddress(msg.from || []),
    subject: msg.subject || "",
    date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
    isUnread: msg.unread === true,
  }));
}

async function fetchTodayEvents(grantId: string, nylasApiKey: string) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    calendar_id: "primary",
    start: String(Math.floor(now.getTime() / 1000)),
    end: String(Math.floor(endOfDay.getTime() / 1000)),
    limit: "20",
  });

  const calRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  if (!calRes.ok) return [];
  const calData = await calRes.json();
  if (calData.error) return [];

  return (calData.data || []).map((event: any) => {
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
      id: event.id,
      summary: event.title || "(No title)",
      start,
      end,
      location: event.location || "",
      attendees: (event.participants || []).map((a: any) => a.name || a.email).filter(Boolean),
    };
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Nylas grant
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grant = await getNylasGrant(adminClient, user.id);

    // Fetch data from connected services
    const [emails, events] = await Promise.all([
      grant ? fetchEmails(grant.grantId, nylasApiKey) : Promise.resolve([]),
      grant ? fetchTodayEvents(grant.grantId, nylasApiKey) : Promise.resolve([]),
    ]);

    const hasGmail = !!grant;
    const hasCalendar = !!grant;

    // Build context for AI summary
    const unreadCount = emails.filter((e: any) => e.isUnread).length;
    const emailSummary = emails.slice(0, 10).map((e: any) =>
      `- From: ${e.from} | Subject: ${e.subject} | ${e.isUnread ? "UNREAD" : "read"}`
    ).join("\n");

    const eventSummary = events.map((e: any) => {
      const start = e.start ? new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "All day";
      const attendeeList = e.attendees.length > 0 ? ` (with ${e.attendees.join(", ")})` : "";
      return `- ${start}: ${e.summary}${attendeeList}${e.location ? ` @ ${e.location}` : ""}`;
    }).join("\n");

    // Generate AI briefing
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const now = new Date();
    const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const prompt = `You are a smart executive assistant. Generate a concise, actionable morning briefing for ${dayOfWeek}, ${dateStr}.

${hasGmail ? `## Inbox (${unreadCount} unread of ${emails.length} recent)
${emailSummary || "No recent emails."}` : "Gmail is not connected."}

${hasCalendar ? `## Today's Calendar
${eventSummary || "No events scheduled for today."}` : "Calendar is not connected."}

Generate a briefing with these sections (use markdown):
1. **☀️ Good morning** — A brief, warm greeting with the day/date
2. **📬 Inbox Snapshot** — Key highlights: how many unread, any urgent-looking emails (from important senders or with urgent subjects), and what can likely wait
3. **📅 Today's Schedule** — Overview of meetings/events, flag any back-to-back meetings or conflicts, mention prep needed
4. **⚡ Suggested Actions** — 3-5 specific, actionable things to do first (e.g., "Reply to [person] about [topic]", "Prepare for 2pm meeting with [person]")
5. **🎯 Focus Tip** — One practical productivity tip based on today's schedule density

Keep it concise, warm, and actionable. Use the actual names and subjects from the data. If a service isn't connected, mention it briefly and suggest connecting it.`;

    const aiResponse = await fetch(
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
            { role: "system", content: "You are a concise, actionable executive assistant. Output clean markdown." },
            { role: "user", content: prompt },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Failed to generate briefing");
    }

    const aiData = await aiResponse.json();
    const briefing = aiData.choices?.[0]?.message?.content || "Unable to generate briefing.";

    return new Response(
      JSON.stringify({
        briefing,
        stats: {
          totalEmails: emails.length,
          unreadEmails: unreadCount,
          todayEvents: events.length,
          gmailConnected: hasGmail,
          calendarConnected: hasCalendar,
        },
        emails: emails.slice(0, 5),
        events: events.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("morning-briefing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
