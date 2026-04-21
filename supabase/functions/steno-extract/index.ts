// Steno mode: extract structured tasks/reminders from a free-form transcript.
// Uses Lovable AI gateway with tool-calling for reliable JSON output.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Normy's stenographer. The user dictates a stream of thoughts — tasks, reminders, follow-ups, birthdays, anniversaries, things they want to remember.

Your job: parse the transcript into clean, structured items. Be generous in extracting (capture everything actionable) but don't invent details. If a date/time isn't given, leave it blank.

Today's date is ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString("en-US", { weekday: "long" })}). Resolve relative dates ("tomorrow", "next Friday", "in 2 weeks") to absolute YYYY-MM-DD.

Item types:
- "task": something to do (project work, errands, deliverables). Has title, optional due_date, priority.
- "reminder": a one-off time-based nudge (call X, email Y back). Has title, optional remind_at (ISO datetime).
- "contact_reminder": birthdays, anniversaries, recurring personal touches. Has contact_name, reminder_date (YYYY-MM-DD), reminder_type (birthday/anniversary/check-in), recurring (true for birthdays/anniversaries).
- "followup": something to follow up on later (no specific date needed). Becomes a task with priority=low.

Keep titles short and imperative ("Call Sarah", "Review Q3 deck"). Strip filler ("um", "remind me to", "I need to").`;

interface ExtractedItem {
  type: "task" | "reminder" | "contact_reminder" | "followup";
  title?: string;
  description?: string;
  due_date?: string;
  priority?: "low" | "medium" | "high";
  remind_at?: string;
  contact_name?: string;
  reminder_date?: string;
  reminder_type?: string;
  recurring?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript } = await req.json();
    const text = (transcript || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ items: [] }), {
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
              name: "capture_items",
              description: "Capture structured tasks, reminders and follow-ups from the transcript.",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["task", "reminder", "contact_reminder", "followup"] },
                        title: { type: "string", description: "Short imperative title" },
                        description: { type: "string", description: "Optional extra detail" },
                        due_date: { type: "string", description: "YYYY-MM-DD for tasks" },
                        priority: { type: "string", enum: ["low", "medium", "high"] },
                        remind_at: { type: "string", description: "ISO datetime for one-off reminders" },
                        contact_name: { type: "string", description: "Person's name for contact_reminder" },
                        reminder_date: { type: "string", description: "YYYY-MM-DD for contact_reminder" },
                        reminder_type: { type: "string", description: "birthday | anniversary | check-in" },
                        recurring: { type: "boolean" },
                      },
                      required: ["type", "title"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "capture_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error", response.status, errText);
      return new Response(JSON.stringify({ error: "Extraction failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let items: ExtractedItem[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        items = Array.isArray(parsed.items) ? parsed.items : [];
      } catch (e) {
        console.error("Failed to parse tool arguments", e);
      }
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("steno-extract error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
