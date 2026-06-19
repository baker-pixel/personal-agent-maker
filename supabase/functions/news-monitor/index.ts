import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


Deno.serve(async (req) => {
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

    const { topics } = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("AI not configured");

    const topicList = topics && topics.length > 0
      ? topics.join(", ")
      : "technology, business, AI, startups";

    const prompt = `You are a news research assistant. Search for and summarize the most important and recent news from the past 24 hours on these topics: ${topicList}.

Return a JSON object with an "articles" array. Each article should have:
- "title": headline
- "summary": 2-3 sentence summary
- "source": publication name
- "topic": which topic it relates to
- "importance": "high", "medium", or "low"
- "url": a real, absolute URL starting with https:// (never relative, never missing protocol)

Return 8-12 articles, prioritized by importance. Focus on actionable business intelligence.`;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a sharp news analyst. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) throw new Error("Rate limited. Try again shortly.");
      if (aiRes.status === 402) throw new Error("AI credits exhausted.");
      throw new Error("Failed to fetch news");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: { articles?: any[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { articles: [] };
    }

    return new Response(
      JSON.stringify({ articles: parsed.articles || [], topics: topicList }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
