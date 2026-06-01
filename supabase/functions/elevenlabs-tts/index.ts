// ElevenLabs TTS proxy — keeps API key server-side, returns MP3 bytes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

// In-memory per-user rate limit: max 10 requests per 60 seconds.
// Persists within a single worker instance — good enough to stop rapid-fire abuse.
const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_MAX) return false; // rate limited
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true; // allowed
}

interface TtsBody {
  text: string;
  voice_id?: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
}

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const DEFAULT_MODEL = "eleven_multilingual_v2";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Rate limit ────────────────────────────────────────────────────────────
    if (!checkRateLimit(user.id)) {
      return json({ error: "Too many requests — please wait before requesting more audio." }, 429);
    }

    // ── Config ────────────────────────────────────────────────────────────────
    if (!ELEVENLABS_API_KEY) return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);

    // ── Request body ──────────────────────────────────────────────────────────
    const body = (await req.json()) as TtsBody;
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "text is required" }, 400);
    if (text.length > 5000) return json({ error: "text exceeds 5000 chars" }, 400);

    const voiceId = body.voice_id || DEFAULT_VOICE;
    const modelId = body.model_id || DEFAULT_MODEL;

    // ── ElevenLabs upstream ───────────────────────────────────────────────────
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: clamp(body.stability ?? 0.5, 0, 1),
            similarity_boost: clamp(body.similarity_boost ?? 0.75, 0, 1),
            style: clamp(body.style ?? 0.3, 0, 1),
            use_speaker_boost: true,
            speed: clamp(body.speed ?? 1.0, 0.7, 1.2),
          },
        }),
      },
    );

    // Pass 429 through directly so the client knows it's a rate limit, not a crash
    if (upstream.status === 429) {
      return json({ error: "ElevenLabs rate limit reached — try again shortly." }, 429);
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("ElevenLabs error", upstream.status, errText);
      return json({ error: errText, status: upstream.status }, 502);
    }

    const audio = await upstream.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("elevenlabs-tts error", err);
    return json({ error: err instanceof Error ? err.message : "unknown error" }, 500);
  }
});
