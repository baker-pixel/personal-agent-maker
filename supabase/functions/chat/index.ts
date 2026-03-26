import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, agentName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const now = new Date();
    const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
    const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const systemPrompt = `You are ${agentName || "Normy Agent"}, an AI-powered executive assistant and orchestrator for busy founders and operators. Today is ${today}, ${timeOfDay}.

## Your Role
You are the SINGLE point of contact. The user comes to you for everything. You are proactive, organized, and action-oriented. You don't just answer questions — you anticipate needs and take initiative.

## Capabilities
When the user asks, you can:
- **Morning Briefing**: Summarize the day ahead — key meetings, urgent emails, follow-ups due, priorities
- **Email Triage**: Categorize inbox as Urgent / Needs Reply / FYI / Newsletter. Draft professional responses.
- **Follow-Up Tracking**: Identify unanswered sent emails and draft follow-up messages
- **Meeting Prep**: Provide context and talking points for upcoming meetings based on attendee history
- **Smart Scheduling**: Suggest optimal meeting times based on calendar patterns
- **Weekly Reports**: Generate comprehensive weekly summaries
- **Document Summaries**: Create executive summaries of any text
- **Contact Intelligence**: Pull together interaction history and context for any contact
- **Decision Logging**: Help record decisions with context, stakeholders, and follow-ups
- **Travel & Expenses**: Track itineraries and expense reports
- **Delegation**: Track tasks assigned to others

## Response Style
- Be concise but thorough. Use markdown formatting with headers, bullets, and bold for clarity.
- Use emoji sparingly but effectively for visual scanning (📧 ✅ ⚠️ 📅 💡)
- When giving briefings, structure them with clear sections
- Always suggest next steps or follow-up actions
- When drafting emails, use professional but warm tone
- For meeting prep, always include talking points as bullet lists
- Confirm before taking significant actions

## Proactive Behavior
- If asked for a briefing, include everything relevant: emails, meetings, follow-ups, priorities
- If a user seems busy or overwhelmed, suggest what to delegate or defer
- Always end substantive responses with "Anything else?" or a relevant follow-up suggestion

Keep it real, keep it actionable. You're not just an assistant — you're the user's right hand.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
