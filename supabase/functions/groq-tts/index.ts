// Groq TTS proxy — keeps API key server-side, returns MP3 bytes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

const DEFAULT_VOICE = "autumn";
const VALID_VOICES = new Set(["autumn", "diana", "hannah", "austin", "daniel", "troy"]);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Warm-up ping: lets the frontend boot this isolate ahead of real use so
  // the first user action doesn't pay the cold-start cost.
  if (req.method === "GET" && new URL(req.url).searchParams.has("warmup")) {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    if (!checkRateLimit(user.id)) {
      return json({ error: "Too many requests — please wait before requesting more audio." }, 429);
    }

    if (!GROQ_API_KEY) return json({ error: "GROQ_API_KEY not configured" }, 500);

    const body = await req.json();
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "text is required" }, 400);
    if (text.length > 5000) return json({ error: "text exceeds 5000 chars" }, 400);

    const voice = VALID_VOICES.has(body.voice) ? body.voice : DEFAULT_VOICE;
    const speed = Math.min(3.0, Math.max(0.1, Number(body.speed) || 1.0));

    const upstream = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", voice, input: text, response_format: "wav", speed }),
    });

    if (upstream.status === 429) {
      return json({ error: "Groq rate limit reached — try again shortly." }, 429);
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Groq TTS error", upstream.status, errText);
      return json({ error: errText, status: upstream.status }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("groq-tts error", err);
    return json({ error: err instanceof Error ? err.message : "unknown error" }, 500);
  }
});
