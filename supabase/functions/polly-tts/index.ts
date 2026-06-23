// Polly TTS proxy — speaks readouts with the same-name Polly generative voice
// as the user's picked Nova Sonic voice, so chat/briefing readouts match live
// voice sessions. Keeps AWS keys server-side, returns MP3 bytes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PollyClient, SynthesizeSpeechCommand } from "npm:@aws-sdk/client-polly@3";
import { getCorsHeaders } from "../_shared/cors.ts";


// Nova Sonic voice id -> Polly generative voice. matthew/tiffany/amy/olivia
// are the same voice lineage in Polly; Polly has no Indian-English generative
// male and no Kiara, so arjun/kiara get the closest available stand-ins.
const VOICE_MAP: Record<string, string> = {
  matthew: "Matthew",
  tiffany: "Tiffany",
  amy: "Amy",
  olivia: "Olivia",
  kiara: "Kajal",
  arjun: "Brian",
};
const DEFAULT_VOICE = "Matthew";

const AWS_REGION = Deno.env.get("POLLY_AWS_REGION") ?? "ap-northeast-1";
const AWS_ACCESS_KEY_ID = Deno.env.get("POLLY_AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = Deno.env.get("POLLY_AWS_SECRET_ACCESS_KEY");

const polly = AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
  ? new PollyClient({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    })
  : null;

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

    if (!polly) return json({ error: "POLLY_AWS keys not configured" }, 500);

    const body = await req.json();
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "text is required" }, 400);
    if (text.length > 5000) return json({ error: "text exceeds 5000 chars" }, 400);

    const voice = VOICE_MAP[body.voiceId] ?? DEFAULT_VOICE;

    const res = await polly.send(new SynthesizeSpeechCommand({
      Engine: "generative",
      VoiceId: voice as any,
      OutputFormat: "mp3",
      Text: text,
      TextType: "text",
    }));
    if (!res.AudioStream) return json({ error: "Polly returned no audio" }, 502);
    const bytes = await res.AudioStream.transformToByteArray();

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    // Throttling from Polly maps to 429 so the client backs off, not falls back.
    const status = msg.includes("Throttling") ? 429 : 500;
    console.error("polly-tts error", err);
    return json({ error: msg }, status);
  }
});
