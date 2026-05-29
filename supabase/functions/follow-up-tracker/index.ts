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

async function fetchSentThreads(grantId: string, nylasApiKey: string) {
  // Fetch sent emails from last 7 days
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const params = new URLSearchParams({
    limit: "25",
    in: "SENT",
    received_after: String(sevenDaysAgo),
  });

  const listRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  const listData = await listRes.json();
  const messages: any[] = listData.data || [];
  if (!messages.length) return [];

  return messages.slice(0, 25).map((msg: any) => ({
    id: msg.id,
    threadId: msg.thread_id,
    from: formatAddress(msg.from || []),
    to: formatAddress(msg.to || []),
    subject: msg.subject || "",
    date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
    snippet: msg.snippet || "",
    labelIds: msg.folders || [],
  }));
}

async function getThreadReplyStatus(grantId: string, nylasApiKey: string, threadId: string, sentMessageId: string) {
  // Fetch all messages in the thread
  const params = new URLSearchParams({ limit: "50" });
  const threadRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/threads/${threadId}`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  const threadData = await threadRes.json();

  if (!threadData.data) return { hasReply: false, messageCount: 1 };

  const thread = threadData.data;
  const messageCount = thread.message_ids?.length || 1;

  // If there's more than one message in the thread and the last message is not from us,
  // then someone replied. We check by fetching the full message list for the thread.
  const listRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/messages?thread_id=${threadId}&limit=50`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  if (!listRes.ok) return { hasReply: false, messageCount };

  const listData = await listRes.json();
  const msgs: any[] = listData.data || [];

  // Find the index of our sent message
  const sentIdx = msgs.findIndex((m: any) => m.id === sentMessageId);
  if (sentIdx === -1) return { hasReply: false, messageCount };

  // Check if there are messages AFTER our sent message that are NOT in SENT folder
  const laterMessages = msgs.slice(sentIdx + 1);
  const hasReply = laterMessages.some((m: any) => !(m.folders || []).includes("SENT"));

  return { hasReply, messageCount };
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    let grantId: string;
    try {
      const grant = await getNylasGrant(adminClient, user.id);
      grantId = grant.grantId;
    } catch (tokenError: any) {
      return new Response(
        JSON.stringify({ error: "Gmail not connected" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sentMessages = await fetchSentThreads(grantId, nylasApiKey);

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
        const status = await getThreadReplyStatus(grantId, nylasApiKey, msg.threadId, msg.id);
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
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

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
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
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
  } catch (error: any) {
    console.error("follow-up-tracker error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
