import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Built-in lead source patterns (sender domain → label)
const SOURCE_DOMAINS: Record<string, string> = {
  "typeform.com": "Typeform",
  "hubspot.com": "HubSpot",
  "calendly.com": "Calendly",
  "mailchimp.com": "Mailchimp",
  "formstack.com": "Formstack",
  "jotform.com": "Jotform",
  "wufoo.com": "Wufoo",
  "google.com": "Google Form",
  "googleforms.com": "Google Form",
  "webflow.com": "Webflow",
  "squarespace.com": "Squarespace",
  "wix.com": "Wix",
  "notion.so": "Notion",
  "shopify.com": "Shopify",
  "stripe.com": "Stripe",
  "intercom.io": "Intercom",
  "zendesk.com": "Zendesk",
  "drift.com": "Drift",
  "gohighlevel.com": "GoHighLevel",
};

// Subject patterns that strongly indicate a lead
const LEAD_SUBJECT_PATTERNS = [
  "new submission", "new lead", "new contact", "contact form", "new inquiry",
  "someone filled out", "new message from", "new form entry", "you have a new",
  "new booking", "new appointment", "new request", "wants to connect",
  "interested in", "demo request", "quote request", "free trial",
  "started a chat", "responded to your",
];

// Common lead-receiver mailbox local parts
const LEAD_INBOXES = ["info", "hello", "contact", "sales", "leads", "support", "inquiries"];

function parseEmail(raw: string): { name: string; email: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].split("@")[0], email: m[2].toLowerCase().trim() };
  if (raw.includes("@")) return { name: raw.split("@")[0], email: raw.toLowerCase().trim() };
  return null;
}

async function getValidToken(admin: any, userId: string, provider: string) {
  const { data: row } = await admin
    .from("google_oauth_tokens").select("*")
    .eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (!row) return null;
  if (new Date(row.token_expires_at) > new Date(Date.now() + 60000)) return row.access_token;
  if (!row.refresh_token) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: row.refresh_token, grant_type: "refresh_token",
      }),
    });
    const d = await r.json();
    if (d.error) return null;
    await admin.from("google_oauth_tokens").update({
      access_token: d.access_token,
      token_expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("provider", provider);
    return d.access_token;
  } catch { return null; }
}

function classify(
  fromEmail: string, subject: string, snippet: string, toRaw: string,
  rules: any[]
): { isLead: boolean; source: string; confidence: number } {
  const fromDomain = fromEmail.split("@")[1] || "";
  const lowerSubj = (subject || "").toLowerCase();
  const lowerSnip = (snippet || "").toLowerCase();
  let confidence = 0;
  let source = "Unknown";

  // 1) Built-in domain match
  for (const [dom, label] of Object.entries(SOURCE_DOMAINS)) {
    if (fromDomain.endsWith(dom)) { confidence += 70; source = label; break; }
  }

  // 2) Subject pattern match
  for (const p of LEAD_SUBJECT_PATTERNS) {
    if (lowerSubj.includes(p) || lowerSnip.includes(p)) { confidence += 50; if (source === "Unknown") source = "Web form"; break; }
  }

  // 3) Recipient inbox match
  const toEmails = (toRaw || "").toLowerCase();
  for (const inbox of LEAD_INBOXES) {
    if (toEmails.includes(`${inbox}@`)) { confidence += 30; if (source === "Unknown") source = `${inbox}@ inbox`; break; }
  }

  // 4) Custom user rules
  for (const r of rules) {
    if (!r.enabled) continue;
    const pat = (r.pattern || "").toLowerCase();
    if (!pat) continue;
    if (r.rule_type === "sender_domain" && fromDomain.includes(pat)) {
      confidence += r.priority || 50; source = r.label || `Custom: ${pat}`;
    } else if (r.rule_type === "subject_keyword" && (lowerSubj.includes(pat) || lowerSnip.includes(pat))) {
      confidence += r.priority || 50; if (source === "Unknown") source = r.label || "Custom rule";
    } else if (r.rule_type === "recipient_inbox" && toEmails.includes(pat)) {
      confidence += r.priority || 50; if (source === "Unknown") source = r.label || `${pat} inbox`;
    }
  }

  return { isLead: confidence >= 50, source, confidence: Math.min(confidence, 100) };
}

async function draftReply(fromName: string, subject: string, snippet: string, source: string, agentName: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const prompt = `You are an executive assistant drafting a warm, professional first reply to a NEW LEAD.

Lead source: ${source}
From: ${fromName}
Subject: ${subject}
Their message: ${snippet}

Write a brief (3-5 sentence) reply that:
- Thanks them for reaching out
- Acknowledges what they're asking about specifically
- Offers a clear next step (call, demo, or follow-up question)
- Sounds human, not templated
- Signs off with the user's first name (use "Me" as placeholder)

Return ONLY the email body text, no subject line, no greeting like "Hi [name]" — start directly with the body.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const gmailToken = await getValidToken(admin, user.id, "gmail");
    if (!gmailToken) {
      return new Response(JSON.stringify({ error: "Gmail not connected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load user prefs (agent name) and custom rules in parallel
    const [{ data: rules }, { data: prefs }] = await Promise.all([
      admin.from("lead_rules").select("*").eq("user_id", user.id).eq("enabled", true),
      admin.from("user_preferences").select("agent_name").eq("user_id", user.id).maybeSingle(),
    ]);
    const agentName = prefs?.agent_name || "Normy";

    // Pull last 3 days, up to 50 messages
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:inbox newer_than:3d",
      { headers: { Authorization: `Bearer ${gmailToken}` } }
    );
    const listData = await listRes.json();
    const messages = listData.messages || [];

    let detected = 0;
    let drafted = 0;

    for (const m of messages) {
      // Skip if we already have this lead
      const { data: existing } = await admin
        .from("leads").select("id").eq("user_id", user.id).eq("gmail_message_id", m.id).maybeSingle();
      if (existing) continue;

      try {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        const msg = await r.json();
        const headers = msg.payload?.headers || [];
        const get = (n: string) => headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
        const from = parseEmail(get("From"));
        if (!from) continue;
        const subject = get("Subject");
        const snippet = msg.snippet || "";
        const toRaw = get("To");
        const dateRaw = get("Date");

        const result = classify(from.email, subject, snippet, toRaw, rules || []);
        if (!result.isLead) continue;

        // Auto-draft a first reply
        const body = await draftReply(from.name, subject, snippet, result.source, agentName);

        let draftId: string | null = null;
        if (body) {
          const { data: draftRow } = await admin.from("draft_actions").insert({
            user_id: user.id,
            type: "lead_reply",
            status: "pending",
            to_email: from.email,
            to_name: from.name,
            subject: `Re: ${subject}`,
            body,
            gmail_message_id: m.id,
            thread_id: msg.threadId || null,
            metadata: { source: result.source, confidence: result.confidence },
          }).select("id").single();
          draftId = draftRow?.id || null;
          if (draftId) drafted++;
        }

        await admin.from("leads").insert({
          user_id: user.id,
          gmail_message_id: m.id,
          thread_id: msg.threadId || null,
          from_name: from.name,
          from_email: from.email,
          subject,
          snippet,
          source: result.source,
          source_type: "auto",
          confidence: result.confidence,
          status: draftId ? "drafted" : "new",
          draft_id: draftId,
          received_at: dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
        });
        detected++;
      } catch (e) {
        console.error("lead detect error for", m.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, detected, drafted, scanned: messages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lead-detector error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
