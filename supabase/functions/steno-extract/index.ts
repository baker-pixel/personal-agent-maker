// Steno mode: extract structured tasks/reminders from a free-form transcript.
// Uses Lovable AI gateway with tool-calling for reliable JSON output.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";


const SYSTEM_PROMPT = `You are Normy's stenographer. The user dictates a stream of thoughts — meetings, brainstorms, tasks, reminders, follow-ups, birthdays, decisions, names, numbers, anything they want to remember.

Your job: parse the transcript into a RICH set of structured items. Be AGGRESSIVE — err on the side of capturing too many items rather than too few. The user can delete what they don't want; they cannot recover what you skipped.

## MEETING FRAMEWORK — answer these 6 questions for every transcript
For every dictation that even loosely resembles a meeting, conversation, or call, extract items so the user can answer all 6 of these later:
1. **Who** was at the meeting? → captured by the summarizer as attendees, but also extract a "key_point" item like "Attendees: Sarah, Mark, Jay" if names are spoken.
2. **When** did/does the meeting happen? → if the meeting itself or any follow-up meeting has a date/time, create a "calendar_event".
3. **Where** was it? → captured by the summarizer; also create a "key_point" if a location is significant ("In-person at Acme HQ").
4. **Key points** from the meeting (decisions, headline numbers, things said worth remembering, who-said-what) → create one "key_point" per distinct takeaway. Aim for 3–10 key points for any meeting longer than ~2 minutes of speech.
5. **Calendar / reminders to set** → every concrete time-bound thing (next meeting, demo, deadline, flight, follow-up call at a specific time) becomes a "calendar_event" or "reminder". Don't skip these — the user EXPECTS Normy to surface them.
6. **Actions to take** → every concrete to-do becomes a "task" (or "followup" if no firm deadline).

A 5-minute meeting transcript should typically produce 8–20 items across these types. If a transcript only yields 2-3 items, you are being too conservative — re-read it and capture more.

Today's date is ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString("en-US", { weekday: "long" })}). Resolve relative dates ("tomorrow", "next Friday", "in 2 weeks") to absolute YYYY-MM-DD.

## Item types
- "calendar_event": a real event happening at a time/place — concerts, dinners, meetings, appointments, flights, parties, follow-up meetings discussed in this session. Has title, event_date (YYYY-MM-DD), optional event_time (HH:MM 24h), optional event_end_time, location, all_day (true if no time given). Goes on Google Calendar.
- "task": a concrete thing to DO. Has title, optional due_date, priority.
- "reminder": a one-off time-based nudge ("call X tomorrow at 3", "email Y back by Friday"). Has title, optional remind_at (ISO datetime).
- "contact_reminder": birthdays, anniversaries, "stay in touch with X". Has contact_name, reminder_date, reminder_type, recurring.
- "followup": revisit later with no firm date — open questions, ideas to explore, names to research, decisions still pending. USE LIBERALLY for the "small stuff".
- "key_point": a non-actionable takeaway from the meeting — a decision, a quote, a number, a fact, who said what, an attendee list, a location note. Title = the takeaway itself in one short line. Description optional for extra context. These do NOT become tasks; they live with the session as the "headline notes" of the meeting.

## Decision rules
- Time + place → calendar_event.
- Verb + concrete action → task or reminder.
- Decision / number / quote / "Sarah said…" / who-was-there / where-it-was → key_point.
- "Circle back on X" / "look into Y" / open question → followup.
- Birthday / anniversary / "stay in touch" → contact_reminder.

Keep titles short and clean. Use description to preserve context. Strip filler ("um", "remind me to", "I need to").`;

interface ExtractedItem {
  type: "task" | "reminder" | "contact_reminder" | "followup" | "calendar_event" | "key_point";
  title?: string;
  description?: string;
  due_date?: string;
  priority?: "low" | "medium" | "high";
  remind_at?: string;
  contact_name?: string;
  reminder_date?: string;
  reminder_type?: string;
  recurring?: boolean;
  event_date?: string;
  event_time?: string;
  event_end_time?: string;
  location?: string;
  all_day?: boolean;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript } = await req.json();
    const text = (transcript || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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
                        type: { type: "string", enum: ["task", "reminder", "contact_reminder", "followup", "calendar_event", "key_point"] },
                        title: { type: "string", description: "Short clean title" },
                        description: { type: "string", description: "Optional extra detail" },
                        due_date: { type: "string", description: "YYYY-MM-DD for tasks" },
                        priority: { type: "string", enum: ["low", "medium", "high"] },
                        remind_at: { type: "string", description: "ISO datetime for one-off reminders" },
                        contact_name: { type: "string", description: "Person's name for contact_reminder" },
                        reminder_date: { type: "string", description: "YYYY-MM-DD for contact_reminder" },
                        reminder_type: { type: "string", description: "birthday | anniversary | check-in" },
                        recurring: { type: "boolean" },
                        event_date: { type: "string", description: "YYYY-MM-DD for calendar_event" },
                        event_time: { type: "string", description: "HH:MM (24h) for calendar_event start" },
                        event_end_time: { type: "string", description: "HH:MM (24h) for calendar_event end" },
                        location: { type: "string", description: "Venue/place for calendar_event" },
                        all_day: { type: "boolean", description: "True if no specific time given" },
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
