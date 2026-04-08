import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(userId: string, provider: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error || !tokenRow) throw new Error(`${provider} not connected`);

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
    .eq("provider", provider);

  return data.access_token;
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

    // Fetch calendar token and gmail token
    const calToken = await getValidToken(user.id, "google-calendar");
    let gmailToken: string | null = null;
    try {
      gmailToken = await getValidToken(user.id, "gmail");
    } catch {
      // Gmail not connected, proceed without email context
    }

    // Fetch today's events
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "10",
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${calToken}` } }
    );
    const calData = await calRes.json();

    if (calData.error) {
      return new Response(JSON.stringify({ error: calData.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events = (calData.items || [])
      .filter((e: any) => (e.attendees && e.attendees.length > 0) || e.description)
      .map((e: any) => ({
        id: e.id,
        summary: e.summary || "(No title)",
        description: e.description || "",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location || "",
        attendees: (e.attendees || []).map((a: any) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
        })),
        htmlLink: e.htmlLink,
      }));

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ meetings: [], message: "No meetings with attendees found for today." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For each meeting, search for related emails from attendees
    let emailContextByMeeting: Record<string, any[]> = {};

    if (gmailToken) {
      for (const event of events) {
        const attendeeEmails = event.attendees
          .map((a: any) => a.email)
          .filter((e: string) => e && !e.includes("calendar.google.com"));

        if (attendeeEmails.length === 0) continue;

        // Search for recent emails from/to attendees
        const query = attendeeEmails.slice(0, 3).map((e: string) => `from:${e} OR to:${e}`).join(" OR ");
        try {
          const listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(query + " newer_than:7d")}`,
            { headers: { Authorization: `Bearer ${gmailToken}` } }
          );
          const listData = await listRes.json();

          if (listData.messages && listData.messages.length > 0) {
            const emails = await Promise.all(
              listData.messages.slice(0, 5).map(async (msg: { id: string }) => {
                const msgRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                  { headers: { Authorization: `Bearer ${gmailToken}` } }
                );
                const msgData = await msgRes.json();
                const headers = msgData.payload?.headers || [];
                const getHeader = (name: string) =>
                  headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
                return {
                  subject: getHeader("Subject"),
                  from: getHeader("From"),
                  date: getHeader("Date"),
                  snippet: msgData.snippet,
                };
              })
            );
            emailContextByMeeting[event.id] = emails;
          }
        } catch {
          // Skip email fetch errors
        }
      }
    }

    // Generate AI prep for each meeting
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
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
              // Fallback to plain content
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

          return { ...event, relatedEmails, prep, error: false, actionItemsCreated: actionItems.length };
        } catch {
          return { ...event, relatedEmails, prep: "Failed to generate prep.", error: true };
        }
      })
    );

    return new Response(
      JSON.stringify({ meetings: meetingsWithPrep }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
