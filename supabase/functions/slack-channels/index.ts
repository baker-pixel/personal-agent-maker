import { getCorsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
    if (!SLACK_API_KEY) {
      throw new Error("SLACK_API_KEY is not configured — connect Slack first");
    }

    const channels: Array<{ id: string; name: string; is_private: boolean; num_members: number }> = [];
    let cursor = "";

    do {
      const url = `${GATEWAY_URL}/conversations.list?limit=200&types=public_channel,private_channel&exclude_archived=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "X-Connection-Api-Key": SLACK_API_KEY,
        },
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
      }

      for (const ch of data.channels ?? []) {
        channels.push({
          id: ch.id,
          name: ch.name,
          is_private: ch.is_private ?? false,
          num_members: ch.num_members ?? 0,
        });
      }

      cursor = data.response_metadata?.next_cursor || "";
    } while (cursor);

    // Sort alphabetically
    channels.sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ channels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("slack-channels error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
