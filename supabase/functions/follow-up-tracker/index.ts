import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(userId: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error || !tokenRow) throw new Error("Gmail not connected");

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) throw new Error("Re-authentication required");

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
  if (data.error) throw new Error(data.error_description || data.error);

  await adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "gmail");

  return data.access_token;
}

async function fetchSentThreads(accessToken: string) {
  // Fetch sent emails from last 7 days
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const query = `in:sent after:${sevenDaysAgo}`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) return [];

  // Fetch message details
  const messages = await Promise.all(
    listData.messages.slice(0, 25).map(async (msg: { id: string; threadId: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      return {
        id: msgData.id,
        threadId: msgData.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msgData.snippet,
        labelIds: msgData.labelIds || [],
      };
    })
  );

  return messages;
}

async function getThreadReplyStatus(accessToken: string, threadId: string, sentMessageId: string) {
  const threadRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const threadData = await threadRes.json();

  if (!threadData.messages) return { hasReply: false, messageCount: 1 };

  // Find if there's a message after the sent one that's NOT from us (i.e., a reply)
  const sentIdx = threadData.messages.findIndex((m: any) => m.id === sentMessageId);
  if (sentIdx === -1) return { hasReply: false, messageCount: threadData.messages.length };

  const laterMessages = threadData.messages.slice(sentIdx + 1);
  const hasReply = laterMessages.some((m: any) => {
    const fromHeader = (m.payload?.headers || []).find(
      (h: any) => h.name.toLowerCase() === "from"
    );
    // If later message is NOT in SENT, it's a reply from someone else
    return !(m.labelIds || []).includes("SENT");
  });

  return { hasReply, messageCount: threadData.messages.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getValidToken(user.id);
    const sentMessages = await fetchSentThreads(accessToken);

    if (sentMessages.length === 0) {
      return new Response(
        JSON.stringify({ followUps: [], stats: { total: 0, overdue: 0, waiting: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate by threadId (keep the most recent sent message per thread)
    const threadMap = new Map<string, any>();
    for (const msg of sentMessages) {
      if (!threadMap.has(msg.threadId)) {
        threadMap.set(msg.threadId, msg);
      }
    }

    // Check reply status for each thread (batch of 15 max)
    const uniqueThreads = Array.from(threadMap.values()).slice(0, 15);
    const replyStatuses = await Promise.all(
      uniqueThreads.map(async (msg) => {
        const status = await getThreadReplyStatus(accessToken, msg.threadId, msg.id);
        return { ...msg, ...status };
      })
    );

    // Filter to only unanswered threads
    const unanswered = replyStatuses.filter((t) => !t.hasReply);

    if (unanswered.length === 0) {
      return new Response(
        JSON.stringify({ followUps: [], stats: { total: 0, overdue: 0, waiting: 0 } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to generate follow-up suggestions
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const emailContext = unanswered.map((e: any, i: number) => {
      const sentDate = new Date(e.date);
      const daysSince = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      return `[Email ${i}]
To: ${e.to}
Subject: ${e.subject}
Sent: ${e.date} (${daysSince} days ago)
Preview: ${e.snippet}`;
    }).join("\n\n");

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are an expert email follow-up assistant. Analyze unanswered sent emails and suggest follow-ups.",
            },
            {
              role: "user",
              content: `These ${unanswered.length} sent emails haven't received replies. For each, assess urgency and draft a polite follow-up.

${emailContext}

Use the suggest_followups tool to return your analysis.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_followups",
                description: "Analyze unanswered emails and suggest follow-ups",
                parameters: {
                  type: "object",
                  properties: {
                    followups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          email_index: { type: "number" },
                          urgency: { type: "string", enum: ["overdue", "due_soon", "can_wait"] },
                          urgency_reason: { type: "string", description: "Why this urgency level" },
                          suggested_action: { type: "string", description: "What to do: follow up, wait, or let go" },
                          draft_followup: { type: "string", description: "A polite, professional follow-up email draft" },
                        },
                        required: ["email_index", "urgency", "urgency_reason", "suggested_action", "draft_followup"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["followups"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "suggest_followups" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI followup error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Failed to generate follow-up suggestions");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let aiFollowups: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        aiFollowups = parsed.followups || [];
      } catch (e) {
        console.error("Failed to parse AI followup response:", e);
      }
    }

    // Merge AI suggestions with email data
    const followUps = aiFollowups.map((f: any) => {
      const email = unanswered[f.email_index];
      if (!email) return null;
      const sentDate = new Date(email.date);
      const daysSince = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: email.id,
        threadId: email.threadId,
        to: email.to,
        subject: email.subject,
        snippet: email.snippet,
        sentDate: email.date,
        daysSince,
        urgency: f.urgency,
        urgencyReason: f.urgency_reason,
        suggestedAction: f.suggested_action,
        draftFollowup: f.draft_followup,
      };
    }).filter(Boolean);

    // Sort: overdue first, then due_soon, then can_wait
    const urgencyOrder: Record<string, number> = { overdue: 0, due_soon: 1, can_wait: 2 };
    followUps.sort((a: any, b: any) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3));

    const stats = {
      total: followUps.length,
      overdue: followUps.filter((f: any) => f.urgency === "overdue").length,
      waiting: followUps.filter((f: any) => f.urgency === "due_soon").length,
    };

    return new Response(
      JSON.stringify({ followUps, stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("follow-up-tracker error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
