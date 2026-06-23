import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    const { type, contactName, contactEmail, reminderType, notes, meetingSummary, meetingAttendees, actionItemTitle, actionItemAssignee } = await req.json();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI not configured");

    let prompt = "";
    let toEmail = "";
    let toName = "";

    if (type === "reminder_followup") {
      if (!contactEmail) throw new Error("Contact email required");
      toEmail = contactEmail;
      toName = contactName;

      const typeLabel: Record<string, string> = {
        birthday: "birthday wishes",
        anniversary: "anniversary congratulations",
        follow_up: "a professional follow-up",
        check_in: "a friendly check-in",
      };

      prompt = `Draft a warm, professional email for ${typeLabel[reminderType] || "a follow-up"} to ${contactName}.
${notes ? `Context/notes about this person: ${notes}` : ""}

Keep it personal but professional. 2-3 short paragraphs max. Don't be overly formal.
Return ONLY a JSON object with "subject" and "body" fields.`;

    } else if (type === "meeting_summary") {
      prompt = `Draft a brief meeting summary/agenda email for the meeting "${meetingSummary}".
Attendees: ${meetingAttendees || "team members"}

Include:
- Meeting purpose/context
- Key agenda items or discussion points
- Any prep needed from attendees

Keep it concise and professional. 2-3 short paragraphs.
Return ONLY a JSON object with "subject" and "body" fields.`;

    } else if (type === "action_nudge") {
      if (!contactEmail) throw new Error("Assignee email required");
      toEmail = contactEmail;
      toName = actionItemAssignee || "";

      prompt = `Draft a polite but clear follow-up email to ${actionItemAssignee || "a team member"} about an overdue task: "${actionItemTitle}".

Be professional, friendly but direct. Mention it's overdue and ask for a status update. Keep it to 1-2 short paragraphs.
Return ONLY a JSON object with "subject" and "body" fields.`;

    } else {
      throw new Error("Invalid type");
    }

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a professional executive assistant drafting emails. Always return valid JSON with 'subject' and 'body' keys only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error("Rate limited. Try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted.");
      throw new Error("Failed to generate draft");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { subject: "Follow-up", body: content };
    }

    // Save as draft action for approval
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (type === "meeting_summary" && meetingAttendees) {
      // Create drafts for each attendee
      const attendeeList = meetingAttendees.split(",").map((e: string) => e.trim()).filter(Boolean);
      for (const email of attendeeList) {
        await adminClient.from("draft_actions").insert({
          user_id: user.id,
          type: "email_reply",
          to_email: email,
          to_name: email.split("@")[0],
          subject: parsed.subject || "Meeting Summary",
          body: parsed.body || "",
        });
      }
      return new Response(
        JSON.stringify({ success: true, draftsCreated: attendeeList.length, subject: parsed.subject, body: parsed.body }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: draft } = await adminClient.from("draft_actions").insert({
      user_id: user.id,
      type: "email_reply",
      to_email: toEmail,
      to_name: toName,
      subject: parsed.subject || "Follow-up",
      body: parsed.body || "",
    }).select().single();

    return new Response(
      JSON.stringify({ success: true, draft, subject: parsed.subject, body: parsed.body }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
