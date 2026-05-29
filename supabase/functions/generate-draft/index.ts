import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractEmail(formatted: string): string {
  const match = formatted.match(/<([^>]+)>/);
  return match ? match[1] : formatted.trim();
}

function extractName(formatted: string): string {
  return formatted.replace(/<[^>]+>/, "").trim() || formatted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      nylas_message_id,
      thread_id,
      from_address,
      from_name,
      subject,
      body,
      user_instructions,
    }: {
      nylas_message_id: string;
      thread_id?: string;
      from_address: string;
      from_name?: string;
      subject: string;
      body: string;
      user_instructions?: string;
    } = await req.json();

    if (!nylas_message_id || !from_address || !subject) {
      return new Response(
        JSON.stringify({ error: "nylas_message_id, from_address and subject are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const senderDisplay = from_name
      ? `${from_name} (${extractEmail(from_address)})`
      : extractEmail(from_address);

    const instructionsBlock = user_instructions?.trim()
      ? `\n\n## REPLY FOCUS\nThe user wants the reply to address the following specifically:\n${user_instructions.trim()}`
      : "";

    const systemPrompt = `You are an expert executive assistant drafting professional email replies on behalf of a busy executive.

Draft a reply that:
- Is professional but matches the sender's tone
- Directly addresses the ask or question
- Is concise — no filler, no unnecessary pleasantries
- Sounds like it was written by a human, not a template
- Does not include a subject line or email headers — body text only${instructionsBlock}`;

    const userPrompt = `Draft a reply to this email.

From: ${senderDisplay}
Subject: ${subject}
Message:
${body}`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 600,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Groq error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI draft generation failed");
    }

    const aiData = await aiResponse.json();
    const draftBody: string = aiData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!draftBody) throw new Error("AI returned empty draft");

    // Save to draft_actions so it lands in the Approval Inbox
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const replySubject = subject.toLowerCase().startsWith("re:")
      ? subject
      : `Re: ${subject}`;

    const { data: draft, error: insertError } = await adminClient
      .from("draft_actions")
      .insert({
        user_id: user.id,
        type: "email_reply",
        status: "pending",
        to_email: extractEmail(from_address),
        to_name: from_name ?? extractName(from_address),
        subject: replySubject,
        body: draftBody,
        thread_id: thread_id ?? null,
        in_reply_to: nylas_message_id,
        nylas_message_id,
      })
      .select("id, body, subject, to_email, to_name")
      .single();

    if (insertError) {
      console.error("draft insert error:", insertError);
      throw new Error("Failed to save draft");
    }

    return new Response(
      JSON.stringify({ draft }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("generate-draft error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
