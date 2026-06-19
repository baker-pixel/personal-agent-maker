import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
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

async function fetchTodaysSentEmails(grantId: string, nylasApiKey: string) {
  try {
    // Nylas: search sent folder (SENT) for today's messages
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const receivedAfter = Math.floor(startOfDay.getTime() / 1000);
    const params = new URLSearchParams({
      limit: "15",
      in: "SENT",
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

    return messages.slice(0, 10).map((msg: any) => ({
      to: formatAddress(msg.to || []),
      subject: msg.subject || "",
    }));
  } catch {
    return [];
  }
}

async function fetchTodaysEvents(grantId: string, nylasApiKey: string) {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(Math.floor(startOfDay.getTime() / 1000)),
      end: String(Math.floor(endOfDay.getTime() / 1000)),
      limit: "20",
    });

    const r = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data.data || []).map((e: any) => {
      const when = e.when || {};
      let start: string | undefined;
      if (when.object === "timespan") start = unixToIso(when.start_time);
      else if (when.object === "date") start = when.date;
      else if (when.object === "datespan") start = when.start_date;
      return {
        summary: e.title || "(No title)",
        start,
        attendees: (e.participants || []).length,
      };
    });
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

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grant = await getNylasGrant(adminClient, user.id);

    const [sentEmails, todaysEvents, completedItems, openItems, overdueItems, handledDrafts] = await Promise.all([
      grant ? fetchTodaysSentEmails(grant.grantId, nylasApiKey) : [],
      grant ? fetchTodaysEvents(grant.grantId, nylasApiKey) : [],
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
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI not configured");

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

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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
  } catch (error: any) {
    console.error("eod-wrapup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
