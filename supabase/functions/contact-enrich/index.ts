// Contact AI enrichment: scans recent emails from a contact and generates
// a "who is this person" summary. READ-ONLY — never modifies emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getAllNylasGrants(adminClient: any, userId: string): Promise<Array<{ grantId: string; email: string }>> {
  const { data: rows } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google");
  if (!rows?.length) return [];
  return rows.map((r: any) => ({ grantId: r.grant_id, email: r.email || "primary" }));
}

function decode64Url(s: string) {
  try {
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch { return ""; }
}

async function fetchEmailsFromContact(grantId: string, nylasApiKey: string, email: string, max = 8) {
  const results: any[] = [];
  try {
    // Fetch messages FROM this contact
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const fromParams = new URLSearchParams({ limit: String(max), from: email });
    const fromRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${fromParams.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (fromRes.ok) {
      const data = await fromRes.json();
      results.push(...(data.data || []));
    }

    // Also fetch messages TO this contact (sent by us)
    if (results.length < max) {
      const ctrl2 = new AbortController();
      const tid2 = setTimeout(() => ctrl2.abort(), 10000);
      const toParams = new URLSearchParams({ limit: String(max), to: email });
      const toRes = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/messages?${toParams.toString()}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl2.signal }
      );
      clearTimeout(tid2);
      if (toRes.ok) {
        const data = await toRes.json();
        results.push(...(data.data || []));
      }
    }

    // Dedupe by message id, sort by date desc, take top max
    const seen = new Set<string>();
    const deduped = results
      .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, max);

    return deduped.map((msg: any) => ({
      subject: msg.subject || "",
      date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
      snippet: msg.snippet || "",
      body: (msg.body || "").slice(0, 800),
    }));
  } catch (e) {
    console.error("fetchEmailsFromContact error:", e);
    return [];
  }
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

    // Fetch recent emails from this contact across all connected Nylas grants
    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grants = await getAllNylasGrants(adminClient, user.id);
    const allEmails: any[] = [];
    for (const g of grants) {
      const emails = await fetchEmailsFromContact(g.grantId, nylasApiKey, contact.email, 5);
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

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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
