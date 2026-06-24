// Mints a short-lived OpenAI Realtime ephemeral key for direct browser WebRTC.
// Verifies the user's JWT, fetches the voice system prompt, then calls
// POST /v1/realtime/client_secrets and returns the ephemeral token to the browser.
// The API key never leaves the server.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VOICE_TOOLS } from "../_shared/voiceTools.ts";

const ALLOWED_ORIGINS = new Set([
  "https://normyagent.com",
  "https://www.normyagent.com",
  "http://localhost:8083",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://normyagent.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const OPENAI_REALTIME_MODEL = "gpt-realtime";
const VALID_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]);
const FALLBACK_PROMPT =
  "You are a helpful executive assistant on a voice call. Keep replies to 1-3 short spoken sentences, no markdown. " +
  "Your context failed to load — you have no access to the user's email, calendar, contacts, or tasks. " +
  "Do not attempt any actions. Politely tell the user to end the session and try again.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify user JWT.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tz = (typeof body.tz === "string" && body.tz) || "UTC";
    const agentName = (typeof body.agentName === "string" && body.agentName) || "Normy";
    const rawVoice = typeof body.voiceId === "string" ? body.voiceId : "";
    const voiceId = VALID_VOICES.has(rawVoice) ? rawVoice : "alloy";
    const devMode = body.devMode === true;

    // Fetch system prompt from voice-session (keeps context logic in one place).
    let systemPrompt = FALLBACK_PROMPT;
    let sessionTools: typeof VOICE_TOOLS | [] = [];
    try {
      const sessionRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/voice-session`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tz, agentName, devMode }),
        signal: AbortSignal.timeout(8_000),
      });
      if (sessionRes.ok) {
        const d = await sessionRes.json();
        if (d.systemPrompt) {
          systemPrompt = d.systemPrompt;
          sessionTools = VOICE_TOOLS;
        }
      }
    } catch (e) {
      console.warn("[voice-token] voice-session fetch failed, using fallback:", e);
    }

    const buildSession = (withVad: boolean) => ({
      type: "realtime",
      model: OPENAI_REALTIME_MODEL,
      audio: { output: { voice: voiceId } },
      instructions: systemPrompt,
      tools: sessionTools,
      ...(withVad ? {
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
          create_response: true,
          idle_timeout_ms: 30000,
        },
      } : {}),
    });

    // Mint ephemeral OpenAI key via the new unified client_secrets endpoint.
    // Try with VAD config first; fall back to bare session if rejected (400/422).
    let oaiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session: buildSession(true) }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!oaiRes.ok && (oaiRes.status === 400 || oaiRes.status === 422)) {
      console.warn("[voice-token] VAD config rejected, retrying without it");
      oaiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session: buildSession(false) }),
        signal: AbortSignal.timeout(20_000),
      });
    }

    if (!oaiRes.ok) {
      const errText = await oaiRes.text().catch(() => "");
      console.error("[voice-token] OpenAI session error:", oaiRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to create voice session", oaiStatus: oaiRes.status, oaiError: errText }), {
        status: 502, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Response from /v1/realtime/client_secrets has a top-level `value` field.
    const session = await oaiRes.json();
    return new Response(JSON.stringify({ client_secret: session.value }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[voice-token] error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
