import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


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
    .eq("status", "valid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !grant) throw Object.assign(new Error("NOT_CONNECTED"), { code: "NOT_CONNECTED" });
  return { grantId: grant.grant_id, email: grant.email };
}

async function fetchEmails(grantId: string, nylasApiKey: string, maxResults = 30) {
  const params = new URLSearchParams({ limit: String(maxResults), in: "INBOX" });
  const listRes = await fetch(
    `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${nylasApiKey}` } }
  );
  if (!listRes.ok) {
    if (listRes.status === 401) {
      const err = new Error("Your Gmail session has expired. Please reconnect your account.") as any;
      err.code = "RECONNECT_REQUIRED";
      throw err;
    }
    if (listRes.status === 403) {
      const err = new Error("Gmail access was denied. This account may be restricted or blocked by an admin.") as any;
      err.code = "ACCOUNT_BLOCKED";
      throw err;
    }
    if (listRes.status === 404 || listRes.status === 422 || listRes.status === 429) {
      const err = new Error("Gmail connection is still initializing. Please try again in a moment.") as any;
      err.code = "GRANT_INITIALIZING";
      throw err;
    }
    const errText = await listRes.text().catch(() => "");
    console.error("Nylas messages fetch failed:", listRes.status, errText);
    throw new Error(`Failed to fetch emails from Nylas (HTTP ${listRes.status})`);
  }
  const listData = await listRes.json();
  const messages: any[] = listData.data || [];
  if (!messages.length) return [];

  return messages.slice(0, maxResults).map((msg: any) => ({
    id: msg.id,
    threadId: msg.thread_id,
    snippet: msg.snippet || "",
    from: formatAddress(msg.from || []),
    to: formatAddress(msg.to || []),
    cc: formatAddress(msg.cc || []),
    subject: msg.subject || "",
    // Store as ISO directly — avoids double-parse (UTCString → Date → ISO) that caused flaky received_at
    date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
    replyTo: formatAddress(msg.reply_to || []),
    body: (msg.body || msg.snippet || "").slice(0, 800),
    labelIds: msg.folders || [],
    isUnread: msg.unread === true,
    isStarred: (msg.folders || []).includes("STARRED"),
    isImportant: (msg.folders || []).includes("IMPORTANT"),
  }));
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
  const corsHeaders = getCorsHeaders(req);
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

    // Parse optional body — force=true re-triages even already-classified emails
    let force = false;
    try {
      const body = await req.clone().json();
      force = body?.force === true;
    } catch {
      // no body or not JSON — that's fine
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

    // Server-side rate limit: force re-triage cooldown 30s, incremental 10s.
    // Prevents duplicate runs from multiple tabs or rapid button presses.
    const cooldownMs = force ? 30_000 : 10_000;
    const { data: lastRun } = await adminClient
      .from("email_metadata")
      .select("processed_at")
      .eq("user_id", user.id)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun?.processed_at) {
      const elapsed = Date.now() - new Date(lastRun.processed_at).getTime();
      if (elapsed < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsed) / 1000);
        return new Response(
          JSON.stringify({ error: "Triage requested too soon. Please wait a moment.", retryAfter }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter) } }
        );
      }
    }

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

    let emails: any[];
    let prefs: any;
    try {
      [emails, prefs] = await Promise.all([
        fetchEmails(grantId, nylasApiKey, 30),
        getUserTriagePrefs(user.id),
      ]);
    } catch (fetchError: any) {
      if (fetchError.code === "RECONNECT_REQUIRED" || fetchError.code === "ACCOUNT_BLOCKED" || fetchError.code === "GRANT_INITIALIZING") {
        return new Response(
          JSON.stringify({ error: fetchError.message, code: fetchError.code }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchError;
    }

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ categories: { urgent: [], needs_reply: [], fyi: [], newsletter: [] }, totalProcessed: 0, actionItemsCreated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which emails need AI triage
    // When force=false: skip emails already in DB with a category (prevents AI from flip-flopping)
    // When force=true (Re-triage button): re-classify everything
    let emailsToTriage = emails;
    let alreadyCategorizedIds = new Set<string>();

    if (!force) {
      const { data: existing } = await adminClient
        .from("email_metadata")
        .select("nylas_message_id")
        .eq("user_id", user.id)
        .in("nylas_message_id", emails.map(e => e.id))
        .not("category", "is", null);

      alreadyCategorizedIds = new Set((existing || []).map((r: any) => r.nylas_message_id));
      emailsToTriage = emails.filter(e => !alreadyCategorizedIds.has(e.id));

      // Refresh is_unread for already-classified emails without touching category/priority
      const staleEmails = emails.filter(e => alreadyCategorizedIds.has(e.id));
      if (staleEmails.length > 0) {
        await adminClient.from("email_metadata").upsert(
          staleEmails.map(e => ({
            user_id: user.id,
            nylas_message_id: e.id,
            is_unread: e.isUnread,
          })),
          { onConflict: "user_id,nylas_message_id" }
        );
      }
    }

    // Cleanup: delete email_metadata rows older than 30 days (always) and,
    // during force re-triage, also remove emails no longer in the Nylas inbox
    // (archived/deleted) — but only within the last 30 days to stay within our fetch window
    if (force) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const currentIds = emails.map(e => e.id);
      if (currentIds.length > 0) {
        await adminClient
          .from("email_metadata")
          .delete()
          .eq("user_id", user.id)
          .gte("received_at", thirtyDaysAgo)
          .not("nylas_message_id", "in", `(${currentIds.map(id => `"${id}"`).join(",")})`)
          .is("replied_at", null);
      }
      // Always purge rows older than 30 days (keeps DB lean)
      await adminClient
        .from("email_metadata")
        .delete()
        .eq("user_id", user.id)
        .lt("received_at", thirtyDaysAgo);
    }

    if (emailsToTriage.length === 0) {
      return new Response(
        JSON.stringify({ totalProcessed: 0, actionItemsCreated: 0, skippedAlreadyClassified: alreadyCategorizedIds.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const emailContext = emailsToTriage.map((e: any, i: number) => {
      const signals: string[] = [];
      if (e.isUnread) signals.push("UNREAD");
      if (e.isStarred) signals.push("STARRED");
      if (e.isImportant) signals.push("GMAIL_IMPORTANT");

      const fromLower = e.from.toLowerCase();
      if (prefs.vip_senders?.some((v: string) => fromLower.includes(v.toLowerCase()))) {
        signals.push("VIP_SENDER");
      }
      if (prefs.dismiss_senders?.some((d: string) => fromLower.includes(d.toLowerCase()))) {
        signals.push("DISMISSED_SENDER");
      }

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


`;

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
          temperature: 0,  // deterministic output — prevents category flipping between runs
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Categorize these ${emailsToTriage.length} emails and extract concrete action items from urgent and needs_reply emails.

${emailContext}

Use the suggest_triage tool to return your analysis.`
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_triage",
                description: "Categorize emails and extract action items from urgent and needs_reply emails",
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
                          ai_summary: { type: "string", description: "One sentence summary of the email content" },
                          priority_score: { type: "number", description: "1-10 priority score, 10 being most urgent" },
                          confidence: { type: "number", description: "0-1 confidence in this categorization" }
                        },
                        required: ["email_index", "category", "reason", "ai_summary", "priority_score", "confidence"],
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
                    },
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
      const email = emailsToTriage[item.email_index];
      if (!email) continue;

      const enriched = {
        ...email,
        category: item.category,
        reason: item.reason,
        aiSummary: item.ai_summary,
        priorityScore: item.priority_score,
        confidence: item.confidence,
      };

      if (categories[item.category]) {
        categories[item.category].push(enriched);
      }
    }

    categories.urgent.sort((a: any, b: any) => b.priorityScore - a.priorityScore);
    categories.needs_reply.sort((a: any, b: any) => b.priorityScore - a.priorityScore);

    // Persist triage results — only for newly triaged emails
    const metadataRows = categorizedEmails.map((item: any) => {
      const email = emailsToTriage[item.email_index];
      if (!email) return null;
      const fromMatch = email.from.match(/<([^>]+)>/);
      const fromEmail = fromMatch ? fromMatch[1] : email.from.trim();
      const fromName = email.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null;
      return {
        user_id: user.id,
        nylas_message_id: email.id,
        nylas_thread_id: email.threadId || null,
        from_address: fromEmail,
        from_name: fromName,
        subject: email.subject || null,
        received_at: email.date,  // already ISO from fetchEmails
        is_unread: email.isUnread,
        category: item.category,
        priority_score: Math.min(10, Math.max(1, Math.round(item.priority_score))),
        ai_summary: item.ai_summary?.slice(0, 500) ?? null,
        ai_reason: item.reason?.slice(0, 300) ?? null,
        processed_at: new Date().toISOString(),
      };
    }).filter(Boolean);

    if (metadataRows.length > 0) {
      const { error: metaErr } = await adminClient
        .from("email_metadata")
        .upsert(metadataRows, { onConflict: "user_id,nylas_message_id" });
      if (metaErr) console.error("email-triage metadata upsert error:", metaErr.message);
    }

    // Fetch replied_at and DB UUIDs for all processed messages in one query
    const messageIds = metadataRows.map((r: any) => r.nylas_message_id);
    const repliedMap: Record<string, string | null> = {};
    const metaIdByMsgId: Record<string, string> = {};
    if (messageIds.length > 0) {
      const { data: repliedRows } = await adminClient
        .from("email_metadata")
        .select("id, nylas_message_id, replied_at")
        .eq("user_id", user.id)
        .in("nylas_message_id", messageIds);
      for (const row of repliedRows || []) {
        repliedMap[row.nylas_message_id] = row.replied_at;
        metaIdByMsgId[row.nylas_message_id] = row.id;
      }
    }

    for (const cat of Object.keys(categories)) {
      categories[cat] = categories[cat].map((e: any) => ({
        ...e,
        repliedAt: repliedMap[e.id] ?? null,
      }));
    }

    // Deduplicated action items — key-based dedup shared with task-extract
    // meeting_summary format: "email:{nylas_message_id}" so both systems cross-check
    let actionItemsCreated = 0;
    if (extractedActions.length > 0) {
      const { data: existingKeys } = await adminClient
        .from("action_items")
        .select("meeting_summary")
        .eq("user_id", user.id)
        .not("meeting_summary", "is", null);
      const seenKeys = new Set(
        (existingKeys || []).map((r: any) => r.meeting_summary)
      );

      const rows = extractedActions
        .map((ai: any) => {
          const sourceEmail = emailsToTriage[ai.from_email_index];
          if (!sourceEmail) return null;
          const key = `email:${sourceEmail.id}`;
          if (seenKeys.has(key)) return null;
          seenKeys.add(key); // guard duplicate action items from same email within this run
          return {
            user_id: user.id,
            title: ai.title,
            priority: ai.priority || "medium",
            due_date: ai.due_date || null,
            status: "suggested",
            source: "email_triage",
            meeting_summary: key,
            email_metadata_id: metaIdByMsgId[sourceEmail.id] || null,
          };
        })
        .filter(Boolean);

      if (rows.length > 0) {
        const { error: insertError } = await adminClient.from("action_items").insert(rows);
        if (!insertError) actionItemsCreated = rows.length;
      }
    }

    // Fire-and-forget push notification for newly triaged urgent emails.
    // Skip on force re-triage — user is already in the app and categories.urgent
    // would include previously-known urgent emails, causing spurious notifications.
    const newUrgentCount = categories.urgent.length;
    if (!force && newUrgentCount > 0) {
      const pushPayload = {
        user_id: user.id,
        title: `${newUrgentCount} urgent email${newUrgentCount > 1 ? "s" : ""} need attention`,
        body: newUrgentCount === 1
          ? `From: ${categories.urgent[0].from}`
          : `${categories.urgent.slice(0, 2).map((e: any) => e.from.split("<")[0].trim() || e.from).join(", ")}${newUrgentCount > 2 ? ` +${newUrgentCount - 2} more` : ""}`,
        url: "/email",
        tag: "urgent-emails",
      };
      fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/web-push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(pushPayload),
        }
      ).catch((e) => console.warn("web-push fire-and-forget failed:", e));
    }

    return new Response(
      JSON.stringify({
        categories,
        totalProcessed: emailsToTriage.length,
        actionItemsCreated,
        skippedAlreadyClassified: alreadyCategorizedIds.size,
        stats: {
          urgent: categories.urgent.length,
          needs_reply: categories.needs_reply.length,
          fyi: categories.fyi.length,
          newsletter: categories.newsletter.length,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("email-triage error:", error);
    const code = (error as any).code || "UNKNOWN";
    const status = (code === "RECONNECT_REQUIRED" || code === "ACCOUNT_BLOCKED" || code === "GRANT_INITIALIZING") ? 200 : code === "NOT_CONNECTED" ? 404 : 500;
    return new Response(
      JSON.stringify({ error: error.message, code }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
