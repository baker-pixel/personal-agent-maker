// Generate AI-drafted follow-up emails to meeting attendees from a Steno session.
// Creates one draft_actions row per resolved attendee email for manual approval.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const SYSTEM_PROMPT = `You draft a concise, professional follow-up email after a meeting. Tone: warm but businesslike, first-person from the user.

Output a SINGLE email body addressed to ONE recipient (the user will personalize per attendee). Structure:
1. One-line opener thanking them or referencing the meeting.
2. A short "Recap" section (3-5 bullets) covering decisions and key points.
3. A "Next steps" section (bullets) listing concrete action items with owner and due date when known.
4. A friendly close inviting questions.

Keep it under 220 words. No subject line — that is generated separately. No signature — the user will add their own.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: session, error: sErr } = await admin
      .from("steno_sessions")
      .select("id, title, summary, key_points, attendees, location, session_date, transcript")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: actions } = await admin
      .from("action_items")
      .select("title, description, due_date, assignee, status")
      .eq("user_id", user.id)
      .eq("steno_session_id", session_id);

    // Resolve attendee names → emails via contacts
    const attendees: string[] = (session.attendees || []).filter(Boolean);
    if (attendees.length === 0) {
      return new Response(JSON.stringify({ error: "No attendees recorded for this session" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contacts } = await admin
      .from("contacts")
      .select("name, email")
      .eq("user_id", user.id)
      .not("email", "is", null);

    const contactMap = new Map<string, { name: string; email: string }>();
    (contacts || []).forEach((c: any) => {
      if (c.email) contactMap.set(c.name.toLowerCase().trim(), { name: c.name, email: c.email });
    });

    const resolved: { name: string; email: string }[] = [];
    const unresolved: string[] = [];
    for (const a of attendees) {
      const key = a.toLowerCase().trim();
      // Try exact match, then first-name match
      let hit = contactMap.get(key);
      if (!hit) {
        for (const [k, v] of contactMap.entries()) {
          if (k.startsWith(key + " ") || key.startsWith(k.split(" ")[0])) { hit = v; break; }
        }
      }
      if (hit) resolved.push(hit);
      else unresolved.push(a);
    }

    if (resolved.length === 0) {
      return new Response(JSON.stringify({
        error: "Couldn't match any attendees to your contacts. Add their emails in Contacts first.",
        unresolved,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI
    const contextLines = [
      `Meeting: ${session.title}`,
      `Date: ${session.session_date}`,
      session.location ? `Location: ${session.location}` : "",
      `Attendees: ${attendees.join(", ")}`,
      "",
      session.summary ? `Summary:\n${session.summary}` : "",
      "",
      session.key_points?.length ? `Key points:\n${session.key_points.map((k: string) => `- ${k}`).join("\n")}` : "",
      "",
      actions?.length ? `Action items:\n${actions.map((a: any) => `- ${a.title}${a.assignee ? ` (owner: ${a.assignee})` : ""}${a.due_date ? ` (due ${a.due_date})` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contextLines },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI draft failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const body = aiData.choices?.[0]?.message?.content?.trim() || "";
    if (!body) {
      return new Response(JSON.stringify({ error: "AI returned empty draft" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `Follow-up: ${session.title}`;

    // Create one draft per resolved attendee
    const drafts = resolved.map((r) => ({
      user_id: user.id,
      type: "email_reply",
      status: "pending",
      to_email: r.email,
      to_name: r.name,
      subject,
      body: `Hi ${r.name.split(" ")[0]},\n\n${body}`,
      metadata: { source: "steno_followup", steno_session_id: session_id },
    }));

    const { data: inserted, error: insErr } = await admin
      .from("draft_actions")
      .insert(drafts)
      .select("id, to_email, to_name");

    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      created: inserted?.length || 0,
      drafts: inserted,
      unresolved,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("steno-followup-draft error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
