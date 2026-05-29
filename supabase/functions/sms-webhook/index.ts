import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * SMS Webhook — receives inbound SMS from Twilio, routes through Normy AI,
 * and sends the reply back via SMS.
 *
 * Twilio sends POST with application/x-www-form-urlencoded body containing:
 *   From, To, Body, MessageSid, etc.
 *
 * We respond with TwiML (empty) and send the reply asynchronously via REST API.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse Twilio's form-encoded body
    const formData = await req.formData();
    const fromNumber = formData.get("From") as string;
    const toNumber = formData.get("To") as string;
    const incomingBody = formData.get("Body") as string;

    if (!fromNumber || !incomingBody) {
      return new Response("<Response/>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    console.log(`SMS from ${fromNumber}: ${incomingBody}`);

    // Look up which user owns this Twilio number / has SMS enabled
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find user by phone (stored in user_preferences) or fall back to first user with prefs
    // For MVP, we look up SMS conversations by phone number
    const { data: smsConvo } = await adminClient
      .from("sms_conversations")
      .select("*")
      .eq("phone_number", fromNumber)
      .maybeSingle();

    let userId: string;
    let conversationHistory: { role: string; content: string }[] = [];
    let agentName = "Normy";

    if (smsConvo) {
      userId = smsConvo.user_id;
      conversationHistory = (smsConvo.messages as any[]) || [];

      // Load agent name
      const { data: prefs } = await adminClient
        .from("user_preferences")
        .select("agent_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (prefs?.agent_name) agentName = prefs.agent_name;
    } else {
      // No existing conversation — try to match by checking all users
      // For MVP, require user to have registered their phone via settings
      // Return a helpful message
      const replyBody =
        "👋 Hi! I don't recognize this number yet. Please register your phone number in the Normy app settings to use SMS.";
      await sendSms(fromNumber, replyBody);
      return new Response("<Response/>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Add the incoming message to history
    conversationHistory.push({ role: "user", content: incomingBody });

    // Keep last 20 messages for context
    const trimmedHistory = conversationHistory.slice(-20);

    // Call the AI
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const now = new Date();
    const timeOfDay =
      now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
    const today = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const systemPrompt = `You are ${agentName}, an AI executive assistant communicating via SMS. Today is ${today}, ${timeOfDay}.

## SMS-Specific Rules
- Keep responses SHORT — SMS has character limits. Aim for under 300 characters when possible.
- No markdown formatting (no **, ##, \`\`\`, etc.) — this is plain text SMS.
- Use simple emoji sparingly for clarity: ✅ ⚠️ 📧 📅
- Be conversational and direct, like texting a real person.
- If the user asks about emails or calendar, give a brief summary and offer to send details.
- For complex tasks, acknowledge and confirm you'll handle it, then summarize what you did.
- Never include draft-json blocks in SMS responses.

## Core Capabilities
You can help with email triage, calendar management, task tracking, and general questions. Keep it snappy.`;

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
          messages: [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
          ],
          stream: false,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      await sendSms(fromNumber, `⚠️ ${agentName} is temporarily unavailable. Please try again shortly.`);
      return new Response("<Response/>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const aiData = await aiResponse.json();
    const assistantMessage =
      aiData.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

    // Save conversation history
    trimmedHistory.push({ role: "assistant", content: assistantMessage });

    await adminClient
      .from("sms_conversations")
      .update({
        messages: trimmedHistory,
        updated_at: new Date().toISOString(),
      })
      .eq("id", smsConvo.id);

    // Send reply via Twilio
    await sendSms(fromNumber, assistantMessage);

    // Return empty TwiML (we already sent the reply via REST)
    return new Response("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("SMS webhook error:", e);
    return new Response("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  }
});

async function sendSms(to: string, body: string) {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not configured");
  if (!TWILIO_PHONE_NUMBER) throw new Error("TWILIO_PHONE_NUMBER not configured");

  // Twilio SMS limit is 1600 chars; split if needed
  const messages = splitMessage(body, 1500);

  for (const msg of messages) {
    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: msg,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`Twilio send error [${response.status}]:`, JSON.stringify(data));
      throw new Error(`Twilio API error: ${response.status}`);
    }
    console.log(`SMS sent to ${to}, SID: ${data.sid}`);
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // Find last space before maxLen
    let splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt === -1) splitAt = maxLen;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return parts;
}
