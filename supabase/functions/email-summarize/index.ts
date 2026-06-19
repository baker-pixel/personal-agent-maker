import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, from_name, from_address, body, ai_summary } = await req.json();

    if (!body && !ai_summary) {
      return new Response(JSON.stringify({ error: "No email content provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const emailContent = `From: ${from_name ? `${from_name} <${from_address}>` : from_address}
Subject: ${subject || "(no subject)"}

${body || ai_summary}`;

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are an executive assistant. Analyze this email and return a structured JSON summary. Be concise and direct. Extract only facts present in the email — do not invent information.`,
          },
          {
            role: "user",
            content: `Summarize this email:\n\n${emailContent}\n\nUse the summarize_email tool.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "summarize_email",
              description: "Return a structured summary of the email",
              parameters: {
                type: "object",
                properties: {
                  tldr: {
                    type: "string",
                    description: "1-2 sentence plain-English summary of what this email is about and what it needs",
                  },
                  action_needed: {
                    type: "string",
                    description: "The single most important action required from the recipient. Empty string if no action needed.",
                  },
                  deadline: {
                    type: "string",
                    description: "Any explicit deadline or time constraint mentioned. Empty string if none.",
                  },
                  key_points: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 bullet points of the most important facts or context from the email",
                  },
                  tone: {
                    type: "string",
                    enum: ["urgent", "friendly", "formal", "neutral", "concerning"],
                    description: "Overall tone of the email",
                  },
                },
                required: ["tldr", "action_needed", "deadline", "key_points", "tone"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "summarize_email" } },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("Groq error:", resp.status, err);
      throw new Error("AI summarization failed");
    }

    const aiData = await resp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No summary returned");

    const summary = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("email-summarize error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
