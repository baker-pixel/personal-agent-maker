// Generates a short title, 1-paragraph summary, and topic tags for a Steno session transcript.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You summarize a user's stream-of-consciousness dictation captured in "Steno Pad". The user is reviewing their own thoughts later, possibly weeks from now. Be faithful to what they said — never invent details.

Produce:
- title: 3-7 words, descriptive of the main subject (e.g. "Q3 planning brainstorm", "Calls to make Monday", "Thoughts on Acme deal").
- summary: ONE paragraph (2-4 sentences) capturing the key topics, decisions, and items mentioned. Write in past tense, third-person ("Discussed...", "Captured tasks for..."). Avoid filler.
- topics: 3-6 short topic tags (lowercase, single or two-word). Examples: "acme deal", "hiring", "travel", "family", "follow-ups".`;

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
                  topics: { type: "array", items: { type: "string" } },
                },
                required: ["title", "summary", "topics"],
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
      // Graceful fallback so saving doesn't fail
      return new Response(
        JSON.stringify({
          title: text.split(/\s+/).slice(0, 6).join(" ").slice(0, 60) || "Steno session",
          summary: text.slice(0, 240),
          topics: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { title: "Steno session", summary: "", topics: [] as string[] };
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        result = {
          title: (parsed.title || "Steno session").slice(0, 80),
          summary: parsed.summary || "",
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
