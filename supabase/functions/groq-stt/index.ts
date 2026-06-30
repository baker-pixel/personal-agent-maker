// STT proxy — receives audio blob, returns transcript via OpenAI Whisper
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";


const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

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
      return json({ error: "Rate limit exceeded — please wait before requesting more transcriptions." }, 429);
    }

    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const formData = await req.formData();
    const audioFile = formData.get("audio");
    if (!audioFile || !(audioFile instanceof File)) {
      return json({ error: "audio file is required" }, 400);
    }

    const language = formData.get("language")?.toString();

    const oaiForm = new FormData();
    oaiForm.append("file", audioFile, audioFile.name || "audio.webm");
    oaiForm.append("model", "whisper-1");
    oaiForm.append("response_format", "json");
    if (language && language !== "auto" && language !== "en-US") {
      oaiForm.append("language", language.split("-")[0]);
    }

    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: oaiForm,
    });

    if (upstream.status === 429) {
      return json({ error: "Rate limit reached — try again shortly." }, 429);
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("STT error", upstream.status, errText);
      return json({ error: errText, status: upstream.status }, 502);
    }

    const result = await upstream.json();
    return json({ text: result.text ?? "" }, 200);
  } catch (err) {
    console.error("groq-stt error", err);
    return json({ error: err instanceof Error ? err.message : "unknown error" }, 500);
  }
});
