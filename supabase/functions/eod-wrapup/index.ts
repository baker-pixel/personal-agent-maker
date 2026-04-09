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

async function fetchTodaysSentEmails(token: string) {
  try {
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "/");
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=is:sent after:${today}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) return [];

    const emails = await Promise.all(
      listData.messages.slice(0, 10).map(async (msg: { id: string }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json();
        const headers = d.payload?.headers || [];
        const get = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        return { to: get("To"), subject: get("Subject") };
      })
    );
    return emails;
  } catch {
    return [];
  }
}

async function fetchTodaysEvents(token: string) {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
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

    const today = new Date().toISOString().split("T")[0];

    // Fetch real data in parallel
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [gmailToken, calToken] = await Promise.all([
      getValidToken(adminClient, user.id, "gmail"),
      getValidToken(adminClient, user.id, "google-calendar"),
    ]);

    const [sentEmails, todaysEvents, completedItems, openItems, overdueItems, handledDrafts] = await Promise.all([
      gmailToken ? fetchTodaysSentEmails(gmailToken) : [],
      calToken ? fetchTodaysEvents(calToken) : [],
      supabase
        .from("action_items")
        .select("title, priority")
        .eq("status", "completed")
        .gte("updated_at", `${today}T00:00:00`)
        .limit(20)
        .then(r => r.data || []),
      supabase
        .from("action_items")
        .select("title, priority, due_date")
        .eq("status", "open")
        .limit(20)
        .then(r => r.data || []),
      supabase
        .from("action_items")
        .select("title, priority, due_date")
        .eq("status", "open")
        .lt("due_date", today)
        .limit(10)
        .then(r => r.data || []),
      // Drafts handled today (approved or dismissed)
      supabase
        .from("draft_actions")
        .select("type, subject, to_name, to_email, status, updated_at, body")
        .in("status", ["approved", "sent", "dismissed"])
        .gte("updated_at", `${today}T00:00:00`)
        .order("updated_at", { ascending: false })
        .limit(20)
        .then(r => r.data || []),
    ]);

    // Tomorrow's date for urgency framing
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const dueTomorrow = openItems.filter((i: any) => i.due_date === tomorrowStr);

    // Pending drafts still waiting for approval
    const { data: pendingDrafts } = await supabase
      .from("draft_actions")
      .select("type, subject, to_name, to_email")
      .eq("status", "pending")
      .limit(10);

    // Generate AI summary
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const approvedDrafts = handledDrafts.filter((d: any) => d.status === "approved" || d.status === "sent");
    const dismissedDrafts = handledDrafts.filter((d: any) => d.status === "dismissed");

    const prompt = `Today is ${dayOfWeek}. Generate an end-of-day wrap-up for an executive. Use markdown formatting with headers.

## Data for today:
- Meetings attended: ${todaysEvents.length}${todaysEvents.length > 0 ? `. Including: ${todaysEvents.map((e: any) => e.summary).join(", ")}` : ""}
- Emails sent: ${sentEmails.length}${sentEmails.length > 0 ? `. Recipients & subjects: ${sentEmails.slice(0, 5).map((e: any) => `"${e.subject || "no subject"}" → ${e.to}`).join("; ")}` : ""}
- Tasks completed today: ${completedItems.length}${completedItems.length > 0 ? `. Including: ${completedItems.map((t: any) => t.title).join(", ")}` : ""}
- Tasks still open: ${openItems.length}${openItems.length > 0 ? `. Including: ${openItems.slice(0, 5).map((t: any) => `${t.title} (${t.priority})`).join(", ")}` : ""}
- Overdue tasks: ${overdueItems.length}${overdueItems.length > 0 ? `. Including: ${overdueItems.map((t: any) => t.title).join(", ")}` : ""}
- Tasks due tomorrow: ${dueTomorrow.length}${dueTomorrow.length > 0 ? `. Including: ${dueTomorrow.map((t: any) => t.title).join(", ")}` : ""}
- Agent drafts approved/sent: ${approvedDrafts.length}${approvedDrafts.length > 0 ? `. Including: ${approvedDrafts.map((d: any) => `${d.type}: "${d.subject || "no subject"}" to ${d.to_name || d.to_email || "unknown"}`).join("; ")}` : ""}
- Agent drafts dismissed: ${dismissedDrafts.length}
- Agent drafts still pending approval: ${(pendingDrafts || []).length}${(pendingDrafts || []).length > 0 ? `. Including: ${(pendingDrafts || []).map((d: any) => `${d.type}: "${d.subject || "no subject"}" to ${d.to_name || d.to_email || "unknown"}`).join("; ")}` : ""}

## Format:
Structure the response with these markdown sections:
### ✅ What Got Done
Brief bullets of accomplishments (meetings, emails, completed tasks, agent drafts sent)

### 🤖 Agent Activity
What the agent handled today — drafts prepared and approved, emails sent on your behalf. Be specific about who received what.

### 📧 Emails Sent
List each email sent today with the recipient and subject line. If none, say so.

### 🔓 Still Open
What's unfinished and needs attention, including pending agent drafts awaiting approval

### 🔥 Urgent for Tomorrow
What's overdue or due tomorrow — prioritized

### 💡 Recommendation
One sentence on what to tackle first tomorrow

Rules:
- Be specific with numbers and names
- Keep each section to 2-5 bullets max
- Sound like a trusted chief of staff wrapping up the day
- If there's nothing for a section, say "Nothing here — nice work!" or similar`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a sharp executive assistant writing an end-of-day wrap-up. Use markdown formatting." },
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
    const summary = aiData.choices?.[0]?.message?.content || "Your end-of-day wrap-up is ready.";

    return new Response(JSON.stringify({
      summary,
      stats: {
        meetings_attended: todaysEvents.length,
        emails_sent: sentEmails.length,
        tasks_completed: completedItems.length,
        tasks_open: openItems.length,
        tasks_overdue: overdueItems.length,
        tasks_due_tomorrow: dueTomorrow.length,
        drafts_handled: approvedDrafts.length,
        drafts_pending: (pendingDrafts || []).length,
      },
      sent_emails: sentEmails,
      handled_drafts: handledDrafts.map((d: any) => ({
        type: d.type,
        subject: d.subject,
        to_name: d.to_name,
        to_email: d.to_email,
        status: d.status,
      })),
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("eod-wrapup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
