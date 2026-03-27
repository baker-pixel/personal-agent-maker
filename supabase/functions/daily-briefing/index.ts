import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(adminClient: any, userId: string, provider: string) {
  const { data: tokenRow } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (!tokenRow) return null;

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
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

async function fetchEmails(token: string) {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:inbox is:unread`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) return [];

    const emails = await Promise.all(
      listData.messages.slice(0, 10).map(async (msg: { id: string }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json();
        const headers = d.payload?.headers || [];
        const get = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        return { from: get("From"), subject: get("Subject"), snippet: d.snippet };
      })
    );
    return emails;
  } catch {
    return [];
  }
}

async function fetchEvents(token: string) {
  try {
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

    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    return (data.items || []).map((e: any) => ({
      summary: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date,
      attendees: (e.attendees || []).length,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if briefing already exists for today
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("daily_briefings")
      .select("*")
      .eq("user_id", user.id)
      .eq("briefing_date", today)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch real data
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [gmailToken, calToken] = await Promise.all([
      getValidToken(adminClient, user.id, "gmail"),
      getValidToken(adminClient, user.id, "google-calendar"),
    ]);

    const [emails, events] = await Promise.all([
      gmailToken ? fetchEmails(gmailToken) : [],
      calToken ? fetchEvents(calToken) : [],
    ]);

    // Fetch overdue action items
    const { data: overdueItems } = await supabase
      .from("action_items")
      .select("title, due_date, priority")
      .eq("status", "open")
      .lt("due_date", today)
      .limit(5);

    // Generate AI summary
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const prompt = `Today is ${dayOfWeek}. Generate a concise daily briefing notification for an executive. Keep it to 3-4 sentences max — punchy, actionable, like a real EA would text their boss first thing in the morning.

Data:
- Unread emails: ${emails.length}${emails.length > 0 ? `. Top senders: ${emails.slice(0, 3).map((e: any) => e.from.split("<")[0].trim()).join(", ")}` : ""}
- Today's meetings: ${events.length}${events.length > 0 ? `. Including: ${events.slice(0, 3).map((e: any) => e.summary).join(", ")}` : ""}
- Overdue tasks: ${overdueItems?.length || 0}${overdueItems?.length ? `. Including: ${overdueItems.map((t: any) => t.title).join(", ")}` : ""}

Rules:
- Lead with the most important thing
- Be specific with numbers and names
- End with what you recommend tackling first
- No markdown, no headers, just clean conversational text
- Sound like a trusted chief of staff, not a robot`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a sharp executive assistant writing a morning notification. Be brief and specific." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error("Rate limited. Try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted.");
      throw new Error("AI service unavailable");
    }

    const aiData = await aiRes.json();
    const summary = aiData.choices?.[0]?.message?.content || "Your daily briefing is ready. Check your inbox and calendar.";

    // Count urgent items
    const urgentCount = (overdueItems?.length || 0) + emails.filter((e: any) =>
      e.subject?.toLowerCase().includes("urgent") || e.subject?.toLowerCase().includes("asap")
    ).length;

    // Save briefing
    const { data: briefing, error: insertError } = await supabase
      .from("daily_briefings")
      .insert({
        user_id: user.id,
        briefing_date: today,
        summary,
        email_count: emails.length,
        meeting_count: events.length,
        urgent_items: urgentCount,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify(briefing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-briefing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
