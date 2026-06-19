// ⚠️ READ-ONLY FILE SEARCH ⚠️
// This function ONLY reads file metadata from Gmail attachments via Nylas.
// It NEVER calls any write endpoint.
// Note: Google Drive search is not available via Nylas; only email attachment
// search is supported. Drive results are returned as an empty array.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

async function getAllNylasGrants(userId: string): Promise<Array<{ grantId: string; email: string }>> {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: rows } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "valid");
  if (!rows?.length) return [];
  return rows.map((r: any) => ({ grantId: r.grant_id, email: r.email || "primary" }));
}

// Use AI to translate a natural-language query into a Gmail search string.
// Returns keywords used for in-memory filtering of Nylas results.
async function translateQuery(naturalQuery: string): Promise<{ gmailQ: string; keywords: string[] }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  const words = naturalQuery.trim().toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const fallback = {
    gmailQ: `has:attachment ${naturalQuery}`,
    keywords: words,
  };
  if (!apiKey) return fallback;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You translate natural-language file-search queries into a Gmail search query string and a list of keywords. Reply ONLY with strict JSON: {\"gmailQ\":\"...\",\"keywords\":[\"word1\",\"word2\"]}. Gmail operators: from:, subject:, has:attachment, filename:, after:, before:. Always include has:attachment in gmailQ. Today is " +
              new Date().toISOString().slice(0, 10) + ".",
          },
          { role: "user", content: naturalQuery },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return fallback;
    const data = await r.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      gmailQ: parsed.gmailQ || fallback.gmailQ,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : words,
    };
  } catch {
    return fallback;
  }
}

async function searchNylasAttachments(
  grantId: string,
  nylasApiKey: string,
  keywords: string[],
  accountEmail: string,
): Promise<{ files: any[]; error: string | null }> {
  try {
    // Fetch recent messages and filter by keyword matches in subject/snippet
    const params = new URLSearchParams({ limit: "30" });
    const listRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
    );
    if (!listRes.ok) return { files: [], error: `Nylas API ${listRes.status}` };
    const listData = await listRes.json();
    const messages: any[] = listData.data || [];

    const out: any[] = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());

    for (const msg of messages.slice(0, 30)) {
      const subject = (msg.subject || "").toLowerCase();
      const snippet = (msg.snippet || "").toLowerCase();
      const combined = subject + " " + snippet;

      // Only include messages that match at least one keyword (or if no keywords provided)
      const matches = lowerKeywords.length === 0 || lowerKeywords.some(k => combined.includes(k));
      if (!matches) continue;

      // Check if message has attachments via Nylas attachments array
      const attachments: any[] = msg.attachments || [];
      if (attachments.length === 0) continue;

      const fromStr = formatAddress(msg.from || []);
      const dateStr = msg.date ? new Date(msg.date * 1000).toUTCString() : "";

      for (const att of attachments) {
        if (!att.filename || att.filename.length === 0) continue;
        // Skip inline images (content-id based)
        if (att.is_inline) continue;

        out.push({
          kind: "gmail",
          id: `${msg.id}::${att.filename}`,
          name: att.filename,
          mimeType: att.content_type || "application/octet-stream",
          modifiedTime: dateStr,
          size: att.size,
          url: `https://mail.google.com/mail/u/0/#inbox/${msg.thread_id || msg.id}`,
          ownerName: fromStr,
          subject: msg.subject || "(no subject)",
          account: accountEmail,
        });
      }
    }

    return { files: out, error: null };
  } catch (e: any) {
    return { files: [], error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (query.length > 500) {
      return new Response(JSON.stringify({ error: "Query too long" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grants = await getAllNylasGrants(user.id);

    if (grants.length === 0) {
      return new Response(JSON.stringify({
        results: [], translated: null,
        error: "No Google account connected. Connect via the Integrations menu.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const translated = await translateQuery(query.trim());
    console.log("files-search translated:", translated);

    const allResults: any[] = [];
    const errors: string[] = [];

    await Promise.all(
      grants.map((g) =>
        searchNylasAttachments(g.grantId, nylasApiKey, translated.keywords, g.email).then((r) => {
          allResults.push(...r.files);
          if (r.error) errors.push(`Gmail (${g.email}): ${r.error}`);
        })
      ),
    );

    // Sort: most recently modified first
    allResults.sort((a, b) => {
      const da = new Date(a.modifiedTime || 0).getTime();
      const db = new Date(b.modifiedTime || 0).getTime();
      return db - da;
    });

    return new Response(JSON.stringify({
      results: allResults.slice(0, 50),
      translated,
      errors: errors.length ? errors : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("files-search error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
