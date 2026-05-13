// Generates a short title, 1-paragraph summary, and topic tags for a Steno session transcript.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You summarize a user's stream-of-consciousness dictation captured in "Steno Pad". The user is reviewing their own thoughts later, possibly weeks from now. Be faithful to what they said — never invent details.

For every transcript, answer these 6 meeting questions through the fields below:
1. WHO was at the meeting → attendees
2. WHEN it happened → captured automatically by the timestamp; if a future follow-up time is mentioned, fold it into the summary
3. WHERE it was → location
4. KEY POINTS (decisions, headline numbers, important things said, who-said-what) → key_points (3–8 short bullets for any meeting > 2 min)
5. CALENDAR / REMINDERS to set → folded into the summary so the user knows what to schedule
6. ACTIONS to take → folded into the summary so the user knows what to do

Produce:
- title: 3-7 words, descriptive of the main subject (e.g. "Q3 planning brainstorm", "Acme deal review with Sarah").
- summary: ONE paragraph (2-4 sentences) capturing key topics, decisions, and any time-sensitive items mentioned. Past tense, third-person ("Discussed...", "Agreed to..."). Avoid filler.
- attendees: array of people who participated in this session/meeting (proper names if given). Empty if user was solo. Do NOT include people merely referenced in passing.
- location: short string for where this happened ("Acme HQ", "Zoom", "phone call"). Empty if not stated.
- key_points: 3–8 short bullet takeaways the user will want to remember weeks later — decisions made, key numbers/dates cited, notable quotes ("Sarah said pricing is the blocker"), open questions raised. Each bullet ≤ 12 words. Empty array only for very short / non-meeting dictations.
- topics: 3-6 short topic tags (lowercase, single or two-word). Examples: "acme deal", "hiring", "travel".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript } = await req.json();
    const text = (transcript || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ title: "Empty session", summary: "", topics: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "summarize_session",
              description: "Return title, summary, and topic tags for a Steno session.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  attendees: { type: "array", items: { type: "string" } },
                  location: { type: "string" },
                  topics: { type: "array", items: { type: "string" } },
                },
                required: ["title", "summary", "attendees", "location", "topics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "summarize_session" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("steno-summarize gateway error", response.status, errText);
      return new Response(
        JSON.stringify({
          title: text.split(/\s+/).slice(0, 6).join(" ").slice(0, 60) || "Steno session",
          summary: text.slice(0, 240),
          attendees: [],
          location: "",
          topics: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { title: "Steno session", summary: "", attendees: [] as string[], location: "", topics: [] as string[] };
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        result = {
          title: (parsed.title || "Steno session").slice(0, 80),
          summary: parsed.summary || "",
          attendees: Array.isArray(parsed.attendees) ? parsed.attendees.slice(0, 12) : [],
          location: (parsed.location || "").slice(0, 120),
          topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 8) : [],
        };
      } catch (e) {
        console.error("steno-summarize parse error", e);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("steno-summarize error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
