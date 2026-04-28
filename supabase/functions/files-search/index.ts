// ⚠️ READ-ONLY FILE SEARCH ⚠️
// This function ONLY reads file metadata from Google Drive and Gmail.
// It NEVER calls files.delete, files.update, files.trash, or any write endpoint.
// The OAuth token requested (drive.readonly) is enforced by Google to reject all writes.
// Do not add write operations to this file. Ever.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshIfNeeded(adminClient: any, tokenRow: any): Promise<string | null> {
  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60_000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;
  try {
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

async function getAllTokens(userId: string): Promise<{ token: string; email: string }[]> {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: rows } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail");
  if (!rows?.length) return [];
  const out: { token: string; email: string }[] = [];
  for (const row of rows) {
    const t = await refreshIfNeeded(adminClient, row);
    if (t) out.push({ token: t, email: row.email || "primary" });
  }
  return out;
}

// Use AI to translate a natural-language query into Google Drive `q=` filter
// and a Gmail search query. Falls back to simple full-text if AI is unavailable.
async function translateQuery(naturalQuery: string): Promise<{ driveQ: string; gmailQ: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const fallback = {
    driveQ: `fullText contains '${naturalQuery.replace(/'/g, "\\'")}' and trashed = false`,
    gmailQ: `has:attachment ${naturalQuery}`,
  };
  if (!apiKey) return fallback;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You translate natural-language file-search queries into two strings: (1) a Google Drive API `q=` filter, and (2) a Gmail search query. Reply ONLY with strict JSON: {\"driveQ\":\"...\",\"gmailQ\":\"...\"}. Drive operators: name contains 'X', fullText contains 'X', mimeType='application/pdf', modifiedTime > '2026-01-01T00:00:00', 'email@x.com' in owners. Always append \" and trashed = false\". Gmail operators: from:, subject:, has:attachment, filename:, after:, before:. Always include has:attachment in gmailQ. Today is " +
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
      driveQ: parsed.driveQ || fallback.driveQ,
      gmailQ: parsed.gmailQ || fallback.gmailQ,
    };
  } catch {
    return fallback;
  }
}

async function searchDrive(token: string, q: string, accountEmail: string) {
  // ONLY GET — no PATCH/PUT/DELETE.
  try {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,owners(displayName,emailAddress))");
    url.searchParams.set("orderBy", "modifiedTime desc");
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { files: [], error: `Drive API ${res.status}` };
    const data = await res.json();
    return {
      files: (data.files || []).map((f: any) => ({
        kind: "drive",
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        url: f.webViewLink,
        iconLink: f.iconLink,
        ownerName: f.owners?.[0]?.displayName,
        ownerEmail: f.owners?.[0]?.emailAddress,
        account: accountEmail,
      })),
      error: null,
    };
  } catch (e: any) {
    return { files: [], error: e.message };
  }
}

async function searchGmailAttachments(token: string, q: string, accountEmail: string) {
  // ONLY GET — no message modification.
  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(q)}`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) return { files: [], error: `Gmail API ${listRes.status}` };
    const listData = await listRes.json();
    if (!listData.messages?.length) return { files: [], error: null };

    const out: any[] = [];
    // Fetch each message metadata + attachment parts
    await Promise.all(
      listData.messages.slice(0, 15).map(async (m: any) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!msgRes.ok) return;
        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
        const date = headers.find((h: any) => h.name === "Date")?.value;

        // Walk parts for attachments (need full format for filenames)
        const fullRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!fullRes.ok) return;
        const full = await fullRes.json();
        const collectAttachments = (part: any, acc: any[] = []): any[] => {
          if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
            acc.push({
              filename: part.filename,
              mimeType: part.mimeType,
              size: part.body.size,
            });
          }
          if (part.parts) part.parts.forEach((p: any) => collectAttachments(p, acc));
          return acc;
        };
        const atts = collectAttachments(full.payload || {});
        atts.forEach((a) => {
          out.push({
            kind: "gmail",
            id: `${m.id}::${a.filename}`,
            name: a.filename,
            mimeType: a.mimeType,
            modifiedTime: date,
            size: a.size,
            url: `https://mail.google.com/mail/u/0/#inbox/${m.threadId || m.id}`,
            ownerName: from,
            subject,
            account: accountEmail,
          });
        });
      }),
    );
    return { files: out, error: null };
  } catch (e: any) {
    return { files: [], error: e.message };
  }
}

serve(async (req) => {
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

    const tokens = await getAllTokens(user.id);
    if (tokens.length === 0) {
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
      tokens.flatMap((t) => [
        searchDrive(t.token, translated.driveQ, t.email).then((r) => {
          allResults.push(...r.files);
          if (r.error) errors.push(`Drive (${t.email}): ${r.error}`);
        }),
        searchGmailAttachments(t.token, translated.gmailQ, t.email).then((r) => {
          allResults.push(...r.files);
          if (r.error) errors.push(`Gmail (${t.email}): ${r.error}`);
        }),
      ]),
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
