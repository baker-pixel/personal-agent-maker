// Email processing queue worker.
// Drains email_processing_queue → fetches messages from Nylas →
// runs AI triage → upserts results into email_metadata.
//
// Called by pg_cron every 2 minutes (service-role bearer auth).
// verify_jwt is disabled — auth validated manually below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NYLAS_BASE = "https://api.us.nylas.com";
const BATCH_SIZE = 10;
const NYLAS_FETCH_TIMEOUT_MS = 8_000;

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|td|th|li|blockquote|h[1-6]|table|tbody|thead)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, "")
    .split("\n").map((l: string) => l.trim()).join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(", ");
}

function extractFirstEmail(formatted: string): string {
  const match = formatted.match(/<([^>]+)>/);
  return match ? match[1] : formatted.split(",")[0]?.trim() ?? formatted;
}

async function fetchNylasMessage(
  grantId: string,
  messageId: string,
  nylasApiKey: string
): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NYLAS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages/${messageId}`,
      {
        headers: { Authorization: `Bearer ${nylasApiKey}` },
        signal: ctrl.signal,
      }
    );
    if (!res.ok) {
      console.warn(`fetchNylasMessage ${messageId}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const msg = data.data ?? data;
    return {
      id: msg.id,
      threadId: msg.thread_id ?? "",
      subject: msg.subject ?? "",
      from: formatAddress(msg.from ?? []),
      fromEmail: extractFirstEmail(formatAddress(msg.from ?? [])),
      fromName: (msg.from?.[0]?.name ?? "").trim(),
      snippet: msg.snippet ?? "",
      body: (() => { const raw = msg.body ?? msg.snippet ?? ""; return (raw.trim().startsWith("<") ? htmlToText(raw) : raw).slice(0, 1_000); })(),
      receivedAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
      isUnread: msg.unread === true,
      folders: msg.folders ?? [],
    };
  } catch (err: any) {
    console.warn(`fetchNylasMessage ${messageId}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getUserTriagePrefs(admin: any, userId: string) {
  const { data } = await admin
    .from("email_triage_preferences")
    .select("vip_senders,dismiss_senders,priority_keywords,dismiss_keywords,custom_instructions,learned_patterns")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? {
    vip_senders: [],
    dismiss_senders: [],
    priority_keywords: [],
    dismiss_keywords: [],
    custom_instructions: "",
    learned_patterns: [],
  };
}

function buildPersonalisedRules(prefs: any): string {
  const sections: string[] = [];
  if (prefs.vip_senders?.length)
    sections.push(`VIP SENDERS (always urgent, score 8+): ${prefs.vip_senders.join(", ")}`);
  if (prefs.dismiss_senders?.length)
    sections.push(`DISMISSED SENDERS (always newsletter, score 1-2): ${prefs.dismiss_senders.join(", ")}`);
  if (prefs.priority_keywords?.length)
    sections.push(`PRIORITY KEYWORDS (boost score +2-3): ${prefs.priority_keywords.join(", ")}`);
  if (prefs.dismiss_keywords?.length)
    sections.push(`DISMISS KEYWORDS (lower score -2-3): ${prefs.dismiss_keywords.join(", ")}`);
  if (prefs.custom_instructions)
    sections.push(`CUSTOM RULES: ${prefs.custom_instructions}`);
  return sections.join("\n");
}

// ─── AI triage for a batch of messages belonging to one user ─────────────────

async function triageBatch(
  messages: any[],
  prefs: any,
  groqApiKey: string
): Promise<Array<{ index: number; category: string; priority_score: number; ai_summary: string; ai_reason: string }>> {
  const personalisedRules = buildPersonalisedRules(prefs);

  const emailContext = messages.map((m, i) => {
    const signals: string[] = [];
    if (m.isUnread) signals.push("UNREAD");
    if (m.folders.includes("STARRED")) signals.push("STARRED");
    if (m.folders.includes("IMPORTANT")) signals.push("GMAIL_IMPORTANT");
    const fromLower = m.from.toLowerCase();
    if (prefs.vip_senders?.some((v: string) => fromLower.includes(v.toLowerCase())))
      signals.push("VIP_SENDER");
    if (prefs.dismiss_senders?.some((d: string) => fromLower.includes(d.toLowerCase())))
      signals.push("DISMISSED_SENDER");
    const text = `${m.subject} ${m.body}`.toLowerCase();
    const pkw = prefs.priority_keywords?.filter((k: string) => text.includes(k.toLowerCase())) ?? [];
    const dkw = prefs.dismiss_keywords?.filter((k: string) => text.includes(k.toLowerCase())) ?? [];
    if (pkw.length) signals.push(`PRIORITY_KW: ${pkw.join(",")}`);
    if (dkw.length) signals.push(`DISMISS_KW: ${dkw.join(",")}`);

    return `[${i}] From: ${m.from} | Subject: ${m.subject} | Signals: ${signals.join(", ") || "none"}
Preview: ${m.snippet}
Body: ${m.body.slice(0, 400)}`;
  }).join("\n\n");

  const systemPrompt = `You are an expert executive email triage assistant. Categorise each email and produce a 1-sentence summary.

CATEGORIES:
- urgent: requires immediate action, deadline <24h, direct ask from important person
- needs_reply: requires a response but not immediately
- fyi: informational, CC'd, read-only
- newsletter: automated, marketing, subscriptions

${personalisedRules ? `USER RULES:\n${personalisedRules}` : ""}

Return JSON only — an array matching the suggest_triage tool schema.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Categorise these ${messages.length} emails:\n\n${emailContext}\n\nUse suggest_triage tool.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_triage",
            description: "Return triage results for all emails",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number" },
                      category: { type: "string", enum: ["urgent", "needs_reply", "fyi", "newsletter"] },
                      priority_score: { type: "number", description: "1-10" },
                      ai_summary: { type: "string", description: "1 sentence" },
                      ai_reason: { type: "string", description: "short reason for category" },
                    },
                    required: ["index", "category", "priority_score", "ai_summary", "ai_reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["results"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_triage" } },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args);
  return parsed.results ?? [];
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey
  );

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;

  // Atomically claim pending jobs (SKIP LOCKED prevents concurrent workers double-processing)
  const { data: jobs, error: claimErr } = await admin.rpc("claim_email_processing_jobs", {
    batch_size: BATCH_SIZE,
  });

  if (claimErr) {
    console.error("email-processor claim error:", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!jobs?.length) {
    return new Response(JSON.stringify({ processed: 0, message: "queue empty" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`email-processor: claimed ${jobs.length} jobs`);

  // Group jobs by user_id so we batch AI calls per user (one Groq call per user)
  const byUser = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!byUser.has(job.user_id)) byUser.set(job.user_id, []);
    byUser.get(job.user_id)!.push(job);
  }

  let doneCount = 0;
  let failCount = 0;

  for (const [userId, userJobs] of byUser) {
    try {
      // Load user triage preferences
      const prefs = await getUserTriagePrefs(admin, userId);

      // Fetch all messages from Nylas in parallel (with per-request timeouts)
      const fetched = await Promise.all(
        userJobs.map((job) =>
          fetchNylasMessage(job.grant_id, job.nylas_message_id, nylasApiKey)
            .then((msg) => ({ job, msg }))
        )
      );

      // Separate successful fetches from failures; skip sent messages
      const fetchable = fetched.filter((f) => f.msg !== null && !f.msg!.folders.includes("SENT"));
      const fetchFailed = fetched.filter((f) => f.msg === null);
      const fetchSent = fetched.filter((f) => f.msg !== null && f.msg!.folders.includes("SENT"));

      // Mark sent messages as done so they don't retry
      for (const { job } of fetchSent) {
        await admin.from("email_processing_queue").update({ status: "done" }).eq("id", job.id);
        doneCount++;
      }

      // Mark Nylas-fetch failures
      for (const { job } of fetchFailed) {
        const newStatus = job.attempts >= 3 ? "failed" : "pending";
        await admin
          .from("email_processing_queue")
          .update({ status: newStatus, error_message: "Nylas fetch failed" })
          .eq("id", job.id);
        failCount++;
      }

      if (!fetchable.length) continue;

      // Run AI triage for this user's messages in one batch call
      const messages = fetchable.map((f) => f.msg!);
      let triageResults: any[];
      try {
        triageResults = await triageBatch(messages, prefs, groqApiKey);
      } catch (aiErr: any) {
        console.error(`email-processor AI error for user ${userId}:`, aiErr.message);
        // Mark all as pending so they retry on next cron run
        for (const { job } of fetchable) {
          const newStatus = job.attempts >= 3 ? "failed" : "pending";
          await admin
            .from("email_processing_queue")
            .update({ status: newStatus, error_message: `AI error: ${aiErr.message}` })
            .eq("id", job.id);
          failCount++;
        }
        continue;
      }

      // Build a lookup map: index → triage result
      const resultByIndex = new Map(triageResults.map((r) => [r.index, r]));

      // Upsert each result to email_metadata and mark job done
      for (let i = 0; i < fetchable.length; i++) {
        const { job, msg } = fetchable[i];
        const triage = resultByIndex.get(i);

        if (!triage) {
          console.warn(`email-processor: no AI result for index ${i}, message ${msg!.id}`);
          await admin
            .from("email_processing_queue")
            .update({ status: "failed", error_message: "No AI result returned" })
            .eq("id", job.id);
          failCount++;
          continue;
        }

        const { error: upsertErr } = await admin
          .from("email_metadata")
          .upsert(
            {
              user_id: userId,
              nylas_message_id: msg!.id,
              nylas_thread_id: msg!.threadId || null,
              from_address: msg!.fromEmail,
              from_name: msg!.fromName || null,
              subject: msg!.subject || null,
              received_at: msg!.receivedAt,
              is_unread: msg!.isUnread,
              category: triage.category,
              priority_score: Math.min(10, Math.max(1, Math.round(triage.priority_score))),
              ai_summary: triage.ai_summary?.slice(0, 500) ?? null,
              ai_reason: triage.ai_reason?.slice(0, 300) ?? null,
              processed_at: new Date().toISOString(),
            },
            { onConflict: "user_id,nylas_message_id" }
          );

        if (upsertErr) {
          console.error(`email-processor upsert error for ${msg!.id}:`, upsertErr.message);
          await admin
            .from("email_processing_queue")
            .update({ status: "failed", error_message: `Upsert: ${upsertErr.message}` })
            .eq("id", job.id);
          failCount++;
          continue;
        }

        await admin
          .from("email_processing_queue")
          .update({ status: "done" })
          .eq("id", job.id);
        doneCount++;
      }
    } catch (userErr: any) {
      console.error(`email-processor unhandled error for user ${userId}:`, userErr.message);
      // Mark all this user's jobs as pending for retry
      for (const job of userJobs) {
        const newStatus = job.attempts >= 3 ? "failed" : "pending";
        await admin
          .from("email_processing_queue")
          .update({ status: newStatus, error_message: userErr.message })
          .eq("id", job.id);
        failCount++;
      }
    }
  }

  const summary = { processed: doneCount, failed: failCount, total: jobs.length };
  console.log("email-processor complete:", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
