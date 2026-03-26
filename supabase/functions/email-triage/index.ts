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

async function fetchEmails(accessToken: string, maxResults = 20) {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:inbox`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) return [];

  const emails = await Promise.all(
    listData.messages.slice(0, maxResults).map(async (msg: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Extract plain text body (first text/plain part)
      let body = "";
      const extractText = (part: any): string => {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
        if (part.parts) {
          for (const p of part.parts) {
            const text = extractText(p);
            if (text) return text;
          }
        }
        return "";
      };
      body = extractText(msgData.payload || {});

      return {
        id: msgData.id,
        threadId: msgData.threadId,
        snippet: msgData.snippet,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        body: body.slice(0, 500), // Limit body size for AI context
        labelIds: msgData.labelIds || [],
        isUnread: (msgData.labelIds || []).includes("UNREAD"),
      };
    })
  );

  return emails;
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
    const emails = await fetchEmails(accessToken, 15);

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ categories: { urgent: [], needs_reply: [], fyi: [], newsletter: [] }, totalProcessed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt for triage
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const emailContext = emails.map((e: any, i: number) => 
      `[Email ${i}]
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Unread: ${e.isUnread}
Preview: ${e.snippet}
Body excerpt: ${e.body.slice(0, 300)}`
    ).join("\n\n");

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
              content: `You are an expert email triage assistant. Categorize emails and draft responses.`
            },
            {
              role: "user",
              content: `Categorize these ${emails.length} emails into exactly 4 categories. For "needs_reply" and "urgent" emails, also draft a brief, professional response.

Categories:
- "urgent": Time-sensitive, requires immediate action (deadlines, emergencies, important requests from key people)
- "needs_reply": Requires a response but not urgent (questions, follow-ups, collaboration requests)
- "fyi": Informational only, no action needed (status updates, shared docs, CC'd threads)
- "newsletter": Automated emails, marketing, subscriptions, notifications from services

${emailContext}

Return a JSON response using the suggest_triage tool. Also extract any concrete action items from urgent and needs_reply emails (e.g., deadlines, requests, tasks to complete).`
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_triage",
                description: "Categorize emails, provide draft responses, and extract action items",
                parameters: {
                  type: "object",
                  properties: {
                    categorized_emails: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          email_index: { type: "number", description: "Index of the email (0-based)" },
                          category: { type: "string", enum: ["urgent", "needs_reply", "fyi", "newsletter"] },
                          reason: { type: "string", description: "Brief explanation of why this category" },
                          draft_response: { type: "string", description: "Draft reply if category is urgent or needs_reply, empty string otherwise" },
                          priority_score: { type: "number", description: "1-10 priority score, 10 being most urgent" }
                        },
                        required: ["email_index", "category", "reason", "draft_response", "priority_score"],
                        additionalProperties: false
                      }
                    },
                    action_items: {
                      type: "array",
                      description: "Action items extracted from urgent and needs_reply emails",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "Concise action item" },
                          from_email_index: { type: "number", description: "Which email this came from" },
                          priority: { type: "string", enum: ["high", "medium", "low"] },
                          due_date: { type: "string", description: "ISO date if a deadline is mentioned, empty otherwise" }
                        },
                        required: ["title", "from_email_index", "priority"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["categorized_emails", "action_items"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "suggest_triage" } }
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI triage error:", aiResponse.status, errText);
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
      throw new Error("Failed to categorize emails");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let categorizedEmails: any[] = [];
    let extractedActions: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        categorizedEmails = parsed.categorized_emails || [];
        extractedActions = parsed.action_items || [];
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Build categorized response with full email data
    const categories: Record<string, any[]> = {
      urgent: [],
      needs_reply: [],
      fyi: [],
      newsletter: [],
    };

    for (const item of categorizedEmails) {
      const email = emails[item.email_index];
      if (!email) continue;
      
      const enriched = {
        ...email,
        category: item.category,
        reason: item.reason,
        draftResponse: item.draft_response,
        priorityScore: item.priority_score,
      };
      
      if (categories[item.category]) {
        categories[item.category].push(enriched);
      }
    }

    // Sort urgent and needs_reply by priority score descending
    categories.urgent.sort((a: any, b: any) => b.priorityScore - a.priorityScore);
    categories.needs_reply.sort((a: any, b: any) => b.priorityScore - a.priorityScore);

    return new Response(
      JSON.stringify({
        categories,
        totalProcessed: emails.length,
        stats: {
          urgent: categories.urgent.length,
          needs_reply: categories.needs_reply.length,
          fyi: categories.fyi.length,
          newsletter: categories.newsletter.length,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("email-triage error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
