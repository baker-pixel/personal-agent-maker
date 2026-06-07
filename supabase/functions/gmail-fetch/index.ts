import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function htmlToText(html: string): string {
  return html
    // strip whole blocks — content + tags
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    // line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    // block-level → newline (opening AND closing each become \n, but we'll collapse later)
    .replace(/<\/?(p|div|tr|td|th|li|blockquote|h[1-6]|table|tbody|thead)[^>]*>/gi, "\n")
    // strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // decode entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "")
    // trim each line (removes indent whitespace that blocks newline collapsing)
    .split("\n").map(l => l.trim()).join("\n")
    // collapse any run of blank/whitespace-only lines into a single blank line
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null }> {
  const { data: grant, error } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    let grantId: string;
    try {
      const grant = await getNylasGrant(adminClient, user.id);
      grantId = grant.grantId;
    } catch (tokenError: any) {
      if (tokenError.code === "NOT_CONNECTED") {
        return new Response(
          JSON.stringify({ error: "Gmail not connected", code: "NOT_CONNECTED" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw tokenError;
    }

    const url = new URL(req.url);
    let bodyParams: Record<string, any> = {};
    if (req.method === "POST") {
      try { bodyParams = await req.json(); } catch { /* no body */ }
    }
    const messageId = url.searchParams.get("messageId") ?? bodyParams.messageId ?? null;

    // Single message full-body fetch
    if (messageId) {
      const msgRes = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/messages/${messageId}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` } }
      );
      if (msgRes.status === 401 || msgRes.status === 404) {
        return new Response(
          JSON.stringify({
            error: "Your Gmail session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!msgRes.ok) {
        const errorText = await msgRes.text();
        console.error("Nylas message fetch failed:", msgRes.status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to fetch Gmail message", code: "GMAIL_API_ERROR" }),
          { status: msgRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const msgData = await msgRes.json();
      const msg = msgData.data;

      const rawBody = msg.body || msg.snippet || "";
      const isHtml = rawBody.trim().startsWith("<");
      const body = isHtml ? htmlToText(rawBody) : rawBody;

      return new Response(
        JSON.stringify({
          id: msg.id,
          threadId: msg.thread_id,
          snippet: msg.snippet,
          from: formatAddress(msg.from || []),
          to: formatAddress(msg.to || []),
          subject: msg.subject || "",
          date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
          body,
          isHtml: false,  // always clean text now
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List emails — parse q param to extract newer_than filter (URL params or POST body)
    const maxResults = url.searchParams.get("maxResults") ?? String(bodyParams.maxResults ?? "50");
    const query = url.searchParams.get("q") ?? bodyParams.q ?? "in:inbox newer_than:2d";

    // Parse "newer_than:Nd" → received_after unix timestamp
    const newerMatch = query.match(/newer_than:(\d+)d/);
    const listParams = new URLSearchParams({
      limit: maxResults,
      in: "INBOX",
    });
    if (newerMatch) {
      const days = parseInt(newerMatch[1], 10);
      const receivedAfter = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
      listParams.set("received_after", String(receivedAfter));
    }

    const listRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${listParams.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
    );

    if (listRes.status === 401 || listRes.status === 404) {
      return new Response(
        JSON.stringify({
          error: "Your Gmail session has expired. Please reconnect your account.",
          code: "RECONNECT_REQUIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listRes.ok) {
      const errorText = await listRes.text();
      console.error("Nylas list fetch failed:", listRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Gmail messages", code: "GMAIL_API_ERROR", detail: errorText }),
        { status: listRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listData = await listRes.json();
    const messages: any[] = listData.data || [];

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ emails: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emails = messages.slice(0, 40).map((msg: any) => ({
      id: msg.id,
      threadId: msg.thread_id,
      snippet: msg.snippet,
      from: formatAddress(msg.from || []),
      to: formatAddress(msg.to || []),
      subject: msg.subject || "",
      date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
      labelIds: msg.folders || [],
      isUnread: msg.unread === true,
    }));

    return new Response(
      JSON.stringify({ emails }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("gmail-fetch fatal error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
