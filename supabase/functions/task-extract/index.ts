import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function fetchRecentEmails(token: string) {
  const list = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in:inbox newer_than:3d",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!list.ok) return [];
  const { messages } = await list.json();
  if (!messages?.length) return [];
  const out: any[] = [];
  for (const m of messages.slice(0, 15)) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) continue;
    const data = await r.json();
    const headers = data.payload?.headers || [];
    const get = (n: string) => headers.find((h: any) => h.name === n)?.value || "";
    out.push({
      id: m.id,
      from: get("From"),
      subject: get("Subject"),
      date: get("Date"),
      snippet: data.snippet || "",
    });
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokens } = await admin
      .from("google_oauth_tokens")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "gmail");

    if (!tokens?.length) {
      return new Response(JSON.stringify({ error: "Connect Gmail first via Integrations" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allEmails: any[] = [];
    for (const t of tokens) {
      const token = await refreshIfNeeded(admin, t);
      if (!token) continue;
      const emails = await fetchRecentEmails(token);
      allEmails.push(...emails);
    }

    if (allEmails.length === 0) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Avoid re-suggesting the same email source
    const { data: existing } = await admin
      .from("action_items")
      .select("meeting_summary")
      .eq("user_id", user.id)
      .eq("source", "ai_email_extract");
    const seenSources = new Set((existing || []).map((r: any) => r.meeting_summary));

    const candidates = allEmails.filter((e) => {
      const tag = `${e.from} — ${e.subject}`;
      return !seenSources.has(tag);
    });

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailsBlock = candidates
      .map((e, i) => `[Email ${i}] from: ${e.from} | subject: ${e.subject} | date: ${e.date}\nsnippet: ${e.snippet}`)
      .join("\n\n");

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today is ${today}. Read these recent emails and extract any IMPLICIT or EXPLICIT tasks the recipient (the user) needs to do. Examples: "can you send the report by Friday", "please review the deck", "let me know your thoughts", "we need your signature".

Skip: marketing, newsletters, calendar invites, automated notifications, FYI-only updates, anything that doesn't require an action FROM THE USER.

For each task return JSON: {"email_index": number, "title": "short imperative (e.g. 'Send Q3 report to Sarah')", "due_date": "YYYY-MM-DD or null if not specified", "priority": "high|medium|low"}

Emails:
${emailsBlock}

Return ONLY a JSON array (possibly empty). No prose, no markdown fences.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI error:", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content || "[]";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    let tasks: any[] = [];
    try {
      tasks = JSON.parse(cleaned);
      if (!Array.isArray(tasks)) tasks = [];
    } catch {
      tasks = [];
    }

    if (tasks.length === 0) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = tasks
      .filter((t) => t.title && typeof t.email_index === "number" && candidates[t.email_index])
      .map((t) => {
        const e = candidates[t.email_index];
        return {
          user_id: user.id,
          title: String(t.title).slice(0, 200),
          description: `From email: "${e.subject}"`,
          due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
          status: "suggested",
          source: "ai_email_extract",
          meeting_summary: `${e.from} — ${e.subject}`,
        };
      });

    if (rows.length === 0) {
      return new Response(JSON.stringify({ suggested: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin.from("action_items").insert(rows);
    if (insErr) {
      console.error("insert error:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggested: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("task-extract error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
