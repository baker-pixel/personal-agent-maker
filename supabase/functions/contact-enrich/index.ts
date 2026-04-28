// Contact AI enrichment: scans recent emails from a contact and generates
// a "who is this person" summary. READ-ONLY — never modifies emails.
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
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await r.json();
  if (data.error) return null;
  await adminClient.from("google_oauth_tokens").update({
    access_token: data.access_token,
    token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", tokenRow.id);
  return data.access_token;
}

async function getAllGmailTokens(adminClient: any, userId: string) {
  const { data: rows } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail");
  if (!rows?.length) return [];
  const out: string[] = [];
  for (const row of rows) {
    const t = await refreshIfNeeded(adminClient, row);
    if (t) out.push(t);
  }
  return out;
}

function decode64Url(s: string) {
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch { return ""; }
}

function extractText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return decode64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return decode64Url(p.body.data);
    }
    for (const p of payload.parts) {
      const nested = extractText(p);
      if (nested) return nested;
    }
  }
  return "";
}

async function fetchEmailsFromContact(token: string, email: string, max = 5) {
  try {
    const q = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${q}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!listRes.ok) return [];
    const list = await listRes.json();
    const ids = (list.messages || []).slice(0, max).map((m: any) => m.id);
    const results: any[] = [];
    for (const id of ids) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
      const date = headers.find((h: any) => h.name === "Date")?.value || "";
      const body = extractText(msg.payload).slice(0, 800);
      results.push({ subject, date, snippet: msg.snippet || body.slice(0, 200) });
    }
    return results;
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { contactId } = await req.json();
    if (!contactId) return new Response(JSON.stringify({ error: "contactId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: contact } = await adminClient
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!contact) return new Response(JSON.stringify({ error: "Contact not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!contact.email) return new Response(JSON.stringify({ error: "Contact has no email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch recent emails from this contact across all connected Gmail accounts
    const tokens = await getAllGmailTokens(adminClient, user.id);
    const allEmails: any[] = [];
    for (const t of tokens) {
      const emails = await fetchEmailsFromContact(t, contact.email, 5);
      allEmails.push(...emails);
    }

    if (allEmails.length === 0) {
      return new Response(JSON.stringify({
        summary: `No recent email history found with ${contact.name}. Try syncing contacts first or this person may not be in your inbox.`,
        topics: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI summary
    const emailContext = allEmails.slice(0, 8).map((e, i) =>
      `Email ${i + 1} (${e.date}):\nSubject: ${e.subject}\n${e.snippet}`
    ).join("\n\n---\n\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an executive assistant building a brief on a contact for your boss. Based on email exchanges, write a tight 2-3 sentence summary covering: who they are (role/company if inferable), the relationship/recurring topics, and most recent context. Then list 3-5 short topic tags. Be factual — never invent details. Respond ONLY with JSON: {"summary": "...", "topics": ["tag1","tag2"]}`,
          },
          {
            role: "user",
            content: `Contact: ${contact.name} <${contact.email}>${contact.company ? ` at ${contact.company}` : ""}${contact.role ? `, ${contact.role}` : ""}\n\nRecent email exchanges:\n\n${emailContext}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "AI enrichment failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    let parsed: any = {};
    try { parsed = JSON.parse(aiData.choices[0].message.content); } catch { parsed = { summary: aiData.choices[0].message.content, topics: [] }; }

    await adminClient.from("contacts").update({
      ai_summary: parsed.summary || null,
      ai_topics: parsed.topics || [],
      enriched_at: new Date().toISOString(),
    }).eq("id", contactId);

    return new Response(JSON.stringify({
      summary: parsed.summary,
      topics: parsed.topics || [],
      emailsAnalyzed: allEmails.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("contact-enrich error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
