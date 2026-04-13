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

  if (error || !tokenRow) {
    const e = new Error("Gmail not connected");
    (e as any).code = "NOT_CONNECTED";
    throw e;
  }

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) {
    const e = new Error("Your Gmail session has expired. Please reconnect your account.");
    (e as any).code = "RECONNECT_REQUIRED";
    throw e;
  }

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
  if (data.error) {
    console.error("Token refresh failed:", data.error, data.error_description);
    if (data.error === "invalid_grant" || data.error === "unauthorized_client") {
      const e = new Error("Your Gmail session has expired. Please reconnect your account.");
      (e as any).code = "RECONNECT_REQUIRED";
      throw e;
    }
    throw new Error(data.error_description || data.error);
  }

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
        to: getHeader("To"),
        cc: getHeader("Cc"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        replyTo: getHeader("Reply-To"),
        body: body.slice(0, 800),
        labelIds: msgData.labelIds || [],
        isUnread: (msgData.labelIds || []).includes("UNREAD"),
        isStarred: (msgData.labelIds || []).includes("STARRED"),
        isImportant: (msgData.labelIds || []).includes("IMPORTANT"),
      };
    })
  );

  return emails;
}

async function getUserTriagePrefs(userId: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data } = await adminClient
    .from("email_triage_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return data || {
    vip_senders: [],
    dismiss_senders: [],
    priority_keywords: [],
    dismiss_keywords: [],
    custom_instructions: "",
    learned_patterns: [],
  };
}

function buildPersonalizedPrompt(prefs: any) {
  const sections: string[] = [];

  if (prefs.vip_senders?.length > 0) {
    sections.push(`## VIP SENDERS (ALWAYS high priority, score 8+)
The user has marked these senders/domains as VIP. Any email from these senders should be classified as "urgent" or "needs_reply" with a priority score of 8 or higher:
${prefs.vip_senders.map((s: string) => `- ${s}`).join("\n")}`);
  }

  if (prefs.dismiss_senders?.length > 0) {
    sections.push(`## DISMISSED SENDERS (ALWAYS low priority)
The user wants to auto-dismiss emails from these senders. Classify as "newsletter" with priority score 1-2:
${prefs.dismiss_senders.map((s: string) => `- ${s}`).join("\n")}`);
  }

  if (prefs.priority_keywords?.length > 0) {
    sections.push(`## PRIORITY KEYWORDS (boost importance)
If these words/phrases appear in the subject or body, boost the priority score by 2-3 points:
${prefs.priority_keywords.map((k: string) => `- "${k}"`).join("\n")}`);
  }

  if (prefs.dismiss_keywords?.length > 0) {
    sections.push(`## DISMISS KEYWORDS (reduce importance)
If these words/phrases appear in the subject or body, reduce priority score by 2-3 points:
${prefs.dismiss_keywords.map((k: string) => `- "${k}"`).join("\n")}`);
  }

  if (prefs.custom_instructions) {
    sections.push(`## USER CUSTOM INSTRUCTIONS
The user has provided these personal triage rules (follow them strictly):
${prefs.custom_instructions}`);
  }

  if (prefs.learned_patterns?.length > 0) {
    sections.push(`## LEARNED PATTERNS (from past user feedback)
These patterns were learned from the user's past email triage decisions:
${prefs.learned_patterns.map((p: any) => `- ${p.description || JSON.stringify(p)}`).join("\n")}`);
  }

  return sections.join("\n\n");
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

    // Fetch emails and user preferences in parallel
    const [accessToken, prefs] = await Promise.all([
      getValidToken(user.id),
      getUserTriagePrefs(user.id),
    ]);

    const emails = await fetchEmails(accessToken, 15);

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ categories: { urgent: [], needs_reply: [], fyi: [], newsletter: [] }, totalProcessed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build rich email context with more signals
    const emailContext = emails.map((e: any, i: number) => {
      const signals: string[] = [];
      if (e.isUnread) signals.push("UNREAD");
      if (e.isStarred) signals.push("STARRED");
      if (e.isImportant) signals.push("GMAIL_IMPORTANT");

      // Check VIP/dismiss sender match
      const fromLower = e.from.toLowerCase();
      if (prefs.vip_senders?.some((v: string) => fromLower.includes(v.toLowerCase()))) {
        signals.push("VIP_SENDER");
      }
      if (prefs.dismiss_senders?.some((d: string) => fromLower.includes(d.toLowerCase()))) {
        signals.push("DISMISSED_SENDER");
      }

      // Check keyword matches
      const textToSearch = `${e.subject} ${e.body}`.toLowerCase();
      const matchedPriorityKw = prefs.priority_keywords?.filter((k: string) => textToSearch.includes(k.toLowerCase())) || [];
      const matchedDismissKw = prefs.dismiss_keywords?.filter((k: string) => textToSearch.includes(k.toLowerCase())) || [];
      if (matchedPriorityKw.length > 0) signals.push(`PRIORITY_KEYWORD_MATCH: ${matchedPriorityKw.join(", ")}`);
      if (matchedDismissKw.length > 0) signals.push(`DISMISS_KEYWORD_MATCH: ${matchedDismissKw.join(", ")}`);

      return `[Email ${i}]
From: ${e.from}
To: ${e.to}
CC: ${e.cc || "none"}
Subject: ${e.subject}
Date: ${e.date}
Signals: ${signals.length > 0 ? signals.join(", ") : "none"}
Preview: ${e.snippet}
Body excerpt: ${e.body.slice(0, 500)}`;
    }).join("\n\n");

    const personalizedRules = buildPersonalizedPrompt(prefs);

    const systemPrompt = `You are an expert executive email triage assistant with deep understanding of business communication patterns. Your job is to accurately categorize emails and identify action items.

## ADVANCED TRIAGE SIGNALS
Use ALL of the following signals to make smart decisions:

1. **Sender Analysis**: Who is the sender? Direct contacts vs automated systems vs unknown senders. Check the "From" field — personal emails (real names) are higher priority than noreply@ addresses.
2. **Thread Context**: Is this email part of an ongoing conversation? Replies in active threads are usually more important.
3. **Action Language**: Look for requests like "please review", "need your input", "can you", "deadline", "ASAP", "by EOD", "action required", "approval needed".
4. **Time Sensitivity**: Check for explicit deadlines, meeting invites, or time-bound requests.
5. **CC vs TO**: If the user is CC'd (not in TO), it's usually FYI. If they're the sole recipient in TO, it's likely actionable.
6. **Gmail Signals**: STARRED and IMPORTANT flags from Gmail's own ML are strong signals.
7. **Content Depth**: Long, thoughtful emails from individuals generally need responses. Short automated notifications don't.
8. **Relationship Signals**: Internal team messages > client messages > vendor messages > automated notifications.

## EMAIL SIGNALS LEGEND
- VIP_SENDER: User has marked this sender as important — always classify high
- DISMISSED_SENDER: User wants to ignore this sender — classify as newsletter
- PRIORITY_KEYWORD_MATCH: User-defined important keyword found in email
- DISMISS_KEYWORD_MATCH: User-defined dismiss keyword found in email
- UNREAD: Email hasn't been read yet
- STARRED: User starred this email in Gmail
- GMAIL_IMPORTANT: Gmail's ML flagged this as important

${personalizedRules ? `\n## USER PERSONALIZATION\n${personalizedRules}` : ""}

## CATEGORIES
- "urgent": Requires immediate action. Deadlines within 24h, direct requests from important people, time-sensitive decisions, emergencies.
- "needs_reply": Requires a response but not immediately. Questions, follow-ups, collaboration, meeting coordination.
- "fyi": Informational — status updates, shared docs, CC'd threads, read-only notifications.
- "newsletter": Automated emails, marketing, subscriptions, system notifications, social media alerts.

## DRAFT RESPONSE GUIDELINES
For urgent and needs_reply emails, draft a response that:
- Matches the sender's tone and formality
- Directly addresses the ask
- Is concise but complete
- Includes any commitments or next steps`;

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
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Categorize these ${emails.length} emails. For "needs_reply" and "urgent" emails, draft a professional response. Extract concrete action items from urgent and needs_reply emails.

${emailContext}

Use the suggest_triage tool to return your analysis.`
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
                          priority_score: { type: "number", description: "1-10 priority score, 10 being most urgent" },
                          confidence: { type: "number", description: "0-1 confidence in this categorization" }
                        },
                        required: ["email_index", "category", "reason", "draft_response", "priority_score", "confidence"],
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
        confidence: item.confidence,
      };
      
      if (categories[item.category]) {
        categories[item.category].push(enriched);
      }
    }

    categories.urgent.sort((a: any, b: any) => b.priorityScore - a.priorityScore);
    categories.needs_reply.sort((a: any, b: any) => b.priorityScore - a.priorityScore);

    // Save extracted action items
    let actionItemsCreated = 0;
    if (extractedActions.length > 0) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const rows = extractedActions.map((ai: any) => {
        const sourceEmail = emails[ai.from_email_index];
        return {
          user_id: user.id,
          title: ai.title,
          priority: ai.priority || "medium",
          due_date: ai.due_date || null,
          source: "email_triage",
          meeting_summary: sourceEmail ? `Email from ${sourceEmail.from}: ${sourceEmail.subject}` : null,
        };
      });

      const { error: insertError } = await adminClient.from("action_items").insert(rows);
      if (!insertError) actionItemsCreated = rows.length;
    }

    return new Response(
      JSON.stringify({
        categories,
        totalProcessed: emails.length,
        actionItemsCreated,
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
    const code = (error as any).code || "UNKNOWN";
    const status = code === "RECONNECT_REQUIRED" ? 401 : code === "NOT_CONNECTED" ? 404 : 500;
    return new Response(
      JSON.stringify({ error: error.message, code }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
