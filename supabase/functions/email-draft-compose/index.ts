import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { to_name, subject, intent } = await req.json();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const prompt = `Write a concise, professional email body for the following:
To: ${to_name || "the recipient"}
Subject: ${subject || "(no subject)"}
Intent: ${intent || subject || ""}

Rules:
- Return ONLY the email body text, no subject line, no "Dear X" greeting unless natural, no sign-off placeholder
- Keep it under 150 words unless the intent requires more detail
- Sound professional but natural, not robotic
- Match the tone to the subject (formal for business, friendly for casual)`;

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are an executive email writing assistant. Write email bodies that are clear, professional, and appropriately concise." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!resp.ok) throw new Error("AI drafting failed");
    const data = await resp.json();
    const body = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ body }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
