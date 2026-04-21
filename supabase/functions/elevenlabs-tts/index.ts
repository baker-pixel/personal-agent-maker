// Elevenlabs TTS proxy — keeps API key server-side, returns MP3 bytes.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as TtsBody;
    const text = (body.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: "text exceeds 5000 chars" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const voiceId = body.voice_id || DEFAULT_VOICE;
    const modelId = body.model_id || DEFAULT_MODEL;

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
            // ElevenLabs requires speed between 0.7 and 1.2
            speed: clamp(body.speed ?? 1.0, 0.7, 1.2),
          },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("ElevenLabs error", upstream.status, errText);
      return new Response(JSON.stringify({ error: errText, status: upstream.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
