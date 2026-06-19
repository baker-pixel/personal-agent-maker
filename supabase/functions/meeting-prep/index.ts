import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function participantStatus(status: string): string {
  const m: Record<string, string> = { yes: "accepted", no: "declined", maybe: "tentative", noreply: "needsAction" };
  return m[status] ?? "needsAction";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;

    // Fetch calendar grant (same grant covers both calendar and email)
    const { grantId } = await getNylasGrant(adminClient, user.id);

    let gmailGrantId: string | null = grantId; // one grant covers both

    // Fetch today's events
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(Math.floor(now.getTime() / 1000)),
      end: String(Math.floor(endOfDay.getTime() / 1000)),
      limit: "10",
    });

    const calRes = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` } }
    );
    const calData = await calRes.json();

    if (!calRes.ok) {
      return new Response(JSON.stringify({ error: calData.message || "Calendar fetch failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawEvents = calData.data || [];
    const events = rawEvents
      .filter((e: any) => (e.participants && e.participants.length > 0) || e.description)
      .map((e: any) => {
        const when = e.when || {};
        let start: string | undefined;
        let end: string | undefined;
        if (when.object === "timespan") {
          start = unixToIso(when.start_time);
          end = unixToIso(when.end_time);
        } else if (when.object === "date") {
          start = when.date;
          end = when.end_date || when.date;
        } else if (when.object === "datespan") {
          start = when.start_date;
          end = when.end_date;
        }
        return {
          id: e.id,
          summary: e.title || "(No title)",
          description: e.description || "",
          start,
          end,
          location: e.location || "",
          attendees: (e.participants || []).map((a: any) => ({
            email: a.email,
            displayName: a.name,
            responseStatus: participantStatus(a.status || "noreply"),
          })),
          htmlLink: e.html_link,
        };
      });

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ meetings: [], message: "No meetings with attendees found for today." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For each meeting, search for related emails from attendees
    let emailContextByMeeting: Record<string, any[]> = {};

    for (const event of events) {
      const attendeeEmails = event.attendees
        .map((a: any) => a.email)
        .filter((e: string) => e && !e.includes("calendar.google.com") && !e.includes("resource.calendar.google.com"));

      if (attendeeEmails.length === 0) continue;

      try {
        // Search for recent emails from attendees using Nylas
        // We fetch recent messages and filter by sender
        const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
        const params = new URLSearchParams({
          limit: "20",
          in: "INBOX",
          received_after: String(sevenDaysAgo),
        });
        const listRes = await fetch(
          `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
          { headers: { Authorization: `Bearer ${nylasApiKey}` } }
        );
        if (!listRes.ok) continue;
        const listData = await listRes.json();
        const allMsgs: any[] = listData.data || [];

        // Filter to messages from/to attendees
        const attendeeEmailSet = new Set(attendeeEmails.slice(0, 3).map((e: string) => e.toLowerCase()));
        const relevantMsgs = allMsgs.filter((msg: any) => {
          const fromEmails = (msg.from || []).map((f: any) => f.email?.toLowerCase());
          const toEmails = (msg.to || []).map((t: any) => t.email?.toLowerCase());
          return fromEmails.some((e: string) => attendeeEmailSet.has(e)) ||
                 toEmails.some((e: string) => attendeeEmailSet.has(e));
        }).slice(0, 5);

        if (relevantMsgs.length > 0) {
          emailContextByMeeting[event.id] = relevantMsgs.map((msg: any) => ({
            subject: msg.subject || "",
            from: formatAddress(msg.from || []),
            date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
            snippet: msg.snippet || "",
          }));
        }
      } catch {
        // Skip email fetch errors
      }
    }

    // Generate AI prep for each meeting
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI not configured");

    const meetingsWithPrep = await Promise.all(
      events.map(async (event: any) => {
        const relatedEmails = emailContextByMeeting[event.id] || [];
        const emailContext = relatedEmails.length > 0
          ? `\n\nRecent email threads with attendees:\n${relatedEmails.map((e: any) => `- Subject: "${e.subject}" from ${e.from} (${e.date})\n  Preview: ${e.snippet}`).join("\n")}`
          : "\n\nNo recent email threads found with attendees.";

        const prompt = `You are an executive assistant preparing meeting prep cards.

Meeting: "${event.summary}"
Time: ${event.start} - ${event.end}
Attendees: ${event.attendees.map((a: any) => `${a.displayName || "Unknown"} <${a.email}> (RSVP: ${a.responseStatus})`).join(", ")}
Description: ${event.description || "None"}
Location: ${event.location || "Not specified"}
${emailContext}

Generate a concise meeting prep card with:
1. **Key Context** - 2-3 bullet points summarizing what this meeting is about based on available info
2. **Talking Points** - 3-5 specific talking points or questions to raise
3. **Action Items to Follow Up** - Any pending items from email threads that should be addressed
4. **Attendee Research** - For EACH attendee, infer their likely role/seniority from their email domain and display name. Note their RSVP status. Mention any recent email interactions you see in the data. If their email domain is a known company, mention the company. Do NOT fabricate LinkedIn URLs or any links.

Keep it actionable and concise. Use markdown formatting.`;

        try {
          const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: "You are a sharp executive assistant. Be concise and actionable. NEVER fabricate URLs or links of any kind." },
                { role: "user", content: prompt },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "meeting_prep_with_actions",
                    description: "Return meeting prep content, extracted action items, and attendee research",
                    parameters: {
                      type: "object",
                      properties: {
                        prep_markdown: { type: "string", description: "Full meeting prep card in markdown" },
                        action_items: {
                          type: "array",
                          description: "Concrete action items extracted from meeting context and emails",
                          items: {
                            type: "object",
                            properties: {
                              title: { type: "string", description: "Concise action item title" },
                              assignee: { type: "string", description: "Person responsible, if identifiable" },
                              priority: { type: "string", enum: ["high", "medium", "low"] },
                            },
                            required: ["title", "priority"],
                            additionalProperties: false,
                          },
                        },
                        attendee_research: {
                          type: "array",
                          description: "Research profile for each attendee",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Display name or email" },
                              email: { type: "string" },
                              company: { type: "string", description: "Inferred company from email domain" },
                              likely_role: { type: "string", description: "Inferred role/seniority from name and context" },
                              rsvp: { type: "string", description: "RSVP status" },
                              recent_interactions: { type: "string", description: "Summary of recent email threads with this person, or 'None found'" },
                            },
                            required: ["name", "email", "company", "rsvp"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["prep_markdown", "action_items", "attendee_research"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "meeting_prep_with_actions" } },
            }),
          });

          if (!aiRes.ok) {
            const status = aiRes.status;
            if (status === 429) return { ...event, relatedEmails, prep: "Rate limited. Try again shortly.", error: true };
            if (status === 402) return { ...event, relatedEmails, prep: "AI credits exhausted.", error: true };
            return { ...event, relatedEmails, prep: "Failed to generate prep.", error: true };
          }

          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

          let prep = "No prep generated.";
          let actionItems: any[] = [];
          let attendeeResearch: any[] = [];

          if (toolCall?.function?.arguments) {
            try {
              const parsed = JSON.parse(toolCall.function.arguments);
              prep = parsed.prep_markdown || prep;
              actionItems = parsed.action_items || [];
              attendeeResearch = parsed.attendee_research || [];
            } catch {
              prep = aiData.choices?.[0]?.message?.content || prep;
            }
          }

          // Save extracted action items to database
          if (actionItems.length > 0) {
            const meetingDate = event.start;
            const rows = actionItems.map((ai: any) => ({
              user_id: user.id,
              title: ai.title,
              assignee: ai.assignee || null,
              priority: ai.priority || "medium",
              source: "meeting_prep",
              meeting_summary: event.summary,
              meeting_date: meetingDate,
            }));

            await adminClient.from("action_items").insert(rows);
          }

          return { ...event, relatedEmails, prep, error: false, actionItemsCreated: actionItems.length, attendeeResearch };
        } catch {
          return { ...event, relatedEmails, prep: "Failed to generate prep.", error: true };
        }
      })
    );

    return new Response(
      JSON.stringify({ meetings: meetingsWithPrep }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
