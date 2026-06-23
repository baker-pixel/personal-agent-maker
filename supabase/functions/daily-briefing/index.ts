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
  try {
    const params = new URLSearchParams({ limit: "10", in: "INBOX" });
    const listRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json();
    const messages: any[] = listData.data || [];
    if (!messages.length) return [];

    return messages.slice(0, 10).map((msg: any) => ({
      from: formatAddress(msg.from || []),
      subject: msg.subject || "",
      snippet: msg.snippet || "",
    }));
  } catch {
    return [];
  }
}

async function fetchEvents(grantId: string, nylasApiKey: string) {
  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(Math.floor(now.getTime() / 1000)),
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
  const corsHeaders = getCorsHeaders(req);
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

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grant = await getNylasGrant(adminClient, user.id);

    const [emails, events] = await Promise.all([
      grant ? fetchEmails(grant.grantId, nylasApiKey) : [],
      grant ? fetchEvents(grant.grantId, nylasApiKey) : [],
    ]);

    // Fetch overdue action items
    const { data: overdueItems } = await supabase
      .from("action_items")
      .select("title, due_date, priority")
      .eq("status", "open")
      .lt("due_date", today)
      .limit(5);

    // Generate AI summary
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI not configured");

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

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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
  } catch (error: any) {
    console.error("daily-briefing error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
