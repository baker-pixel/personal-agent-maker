import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
}

async function fetchEmails(accessToken: string) {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=is:inbox newer_than:1d`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) return [];

  const emails = await Promise.all(
    listData.messages.slice(0, 15).map(async (msg: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      return {
        id: msgData.id,
        snippet: msgData.snippet,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        isUnread: (msgData.labelIds || []).includes("UNREAD"),
      };
    })
  );

  return emails;
}

async function fetchTodayEvents(accessToken: string) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const calData = await calRes.json();

  if (calData.error) return [];

  return (calData.items || []).map((event: any) => ({
    id: event.id,
    summary: event.summary || "(No title)",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || "",
    attendees: (event.attendees || []).map((a: any) => a.displayName || a.email).filter(Boolean),
  }));
}

Deno.serve(async (req) => {
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

    // Fetch Gmail and Calendar tokens in parallel
    const [gmailToken, calendarToken] = await Promise.all([
      getValidToken(user.id, "gmail"),
      getValidToken(user.id, "google-calendar"),
    ]);

    // Fetch data from connected services
    const [emails, events] = await Promise.all([
      gmailToken ? fetchEmails(gmailToken) : Promise.resolve([]),
      calendarToken ? fetchTodayEvents(calendarToken) : Promise.resolve([]),
    ]);

    const hasGmail = !!gmailToken;
    const hasCalendar = !!calendarToken;

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
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
  } catch (error) {
    console.error("morning-briefing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
