// WebSocket bridge: browser <-> Nova 2 Sonic (Bedrock bidirectional stream).
//
// Browser -> server (JSON):
//   { type: "start", token, agentName?, voiceId?, tz? }   token = supabase user JWT
//   { type: "audio", data: <base64 16kHz LE16 mono> }
//   { type: "stop" }
//
// Server -> browser (JSON):
//   { type: "ready" }
//   { type: "audio", data: <base64 24kHz LE16 mono> }
//   { type: "transcript", role, text }
//   { type: "toolUse", name }                      tool started (for UI spinner)
//   { type: "toolResult", name, success, message } tool finished
//   { type: "interrupted" }                        barge-in: stop playback now
//   { type: "closed" } | { type: "error", message }
import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer } from "ws";
import { SonicSession } from "./sonic-session.mjs";
import { SONIC_TOOLS } from "./tools.mjs";

const PORT = Number(process.env.PORT || 8787);
const { AWS_REGION, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
for (const [k, v] of Object.entries({ AWS_REGION, SUPABASE_URL, SUPABASE_ANON_KEY, AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID })) {
  if (!v) { console.error(`Missing required env: ${k}`); process.exit(1); }
}

const MAX_SESSION_MS = 10 * 60 * 1000; // hard cap per voice session
const CONTEXT_TTL_MS = 60 * 1000;
const contextCache = new Map(); // token -> { systemPrompt, ts }
const READ_TOOLS = new Set(["read_email"]);
// Nova 2 Sonic voice catalog — English voices only (must match src/lib/sonicVoices.ts).
const SONIC_VOICES = new Set([
  "matthew", "tiffany", "amy", "olivia", "kiara", "arjun",
]);
const FALLBACK_PROMPT = "You are a helpful executive assistant on a voice call. Keep replies to 1-3 short spoken sentences, no formatting.";

async function supabaseFn(name, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || data.msg || `${name} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- one-shot TTS (voice previews) ------------------------------------------
// Sonic has no TTS API and only generates after a spoken user turn (text turns
// are context-only). Workaround: a canned trigger utterance + a system prompt
// that says "ignore the user, say exactly <text>". Costs a full Sonic session
// per call — previews only, not readouts.
const TTS_MAX_CHARS = 300;
const TTS_TIMEOUT_MS = 20_000;
const TTS_TRIGGER_PCM = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "confirm-utterance.wav")
).subarray(44); // skip WAV header — 16kHz LE16 mono PCM
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifySupabaseToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);  // PCM
  header.writeUInt16LE(1, 22);  // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32);  // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function synthesizeOnce({ text, voiceId }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let session = null;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session?.end();
      if (err) reject(err);
      else if (chunks.length === 0) reject(new Error("Sonic produced no audio"));
      else resolve(pcmToWav(Buffer.concat(chunks)));
    };
    const timer = setTimeout(() => finish(new Error("Sonic TTS timed out")), TTS_TIMEOUT_MS);

    session = new SonicSession({
      region: AWS_REGION,
      voiceId,
      systemPrompt:
        "You are a voice preview engine. No matter what the user says, reply by saying exactly " +
        `this and nothing else: "${text.replace(/"/g, "'")}"`,
      tools: [],
      onEvent: (event) => {
        const kind = Object.keys(event)[0];
        if (kind === "audioOutput") {
          chunks.push(Buffer.from(event.audioOutput.content, "base64"));
        } else if (kind === "contentEnd" && event.contentEnd.type === "AUDIO") {
          finish();
        }
      },
      onError: (e) => finish(e),
      onClose: () => finish(),
    });
    session.start()
      .then(async () => {
        // Stream the trigger utterance (faster than realtime is fine), then
        // enough silence for server-side VAD to close the turn.
        const CHUNK = 1024;
        session.startAudio();
        for (let i = 0; i < TTS_TRIGGER_PCM.length && !settled; i += CHUNK) {
          session.sendAudioChunk(TTS_TRIGGER_PCM.subarray(i, i + CHUNK).toString("base64"));
          await sleep(10);
        }
        const silence = Buffer.alloc(CHUNK).toString("base64");
        for (let i = 0; i < 150 && !settled; i++) {
          session.sendAudioChunk(silence);
          await sleep(10);
        }
      })
      .catch((e) => finish(e));
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://normyagent.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Powered-By": "",
};

async function handleTts(req, res) {
  const sendJson = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(body));
  };
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) { sendJson(413, { error: "Body too large" }); return; }
    }
    const body = JSON.parse(raw || "{}");
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token || !(await verifySupabaseToken(token))) {
      sendJson(401, { error: "Authentication failed" });
      return;
    }
    const text = String(body.text || "").slice(0, TTS_MAX_CHARS).trim();
    if (!text) { sendJson(400, { error: "Missing text" }); return; }
    const voiceId = SONIC_VOICES.has(body.voiceId) ? body.voiceId : "matthew";

    const wav = await synthesizeOnce({ text, voiceId });
    res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, ...CORS_HEADERS });
    res.end(wav);
    console.log(`[tts] ok voice=${voiceId} chars=${text.length} bytes=${wav.length}`);
  } catch (e) {
    console.error("[tts] failed:", e.message);
    sendJson(502, { error: "TTS failed" });
  }
}

const httpServer = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
  } else if (req.url === "/tts" && req.method === "POST") {
    handleTts(req, res);
  } else if (req.url === "/" || req.url === "/test") {
    res.writeHead(200, { "Content-Type": "text/html", ...CORS_HEADERS });
    res.end(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "test-client.html")));
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ ok: true, region: AWS_REGION }));
  } else {
    res.writeHead(404, CORS_HEADERS); res.end();
  }
});
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  let session = null;
  let sessionTimer = null;
  let alive = true;
  const tag = `[ws ${req.socket.remoteAddress}]`;
  const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

  ws.on("pong", () => { alive = true; });

  const teardown = () => {
    clearTimeout(sessionTimer);
    session?.end();
    session = null;
  };

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "start") {
      if (session) return; // one session per socket
      if (!msg.token) { send({ type: "error", message: "Missing auth token" }); return; }

      const tz = typeof msg.tz === "string" && msg.tz ? msg.tz : "UTC";
      const token = msg.token;

      // Build per-user context. Auth failure is fatal; context failure is not.
      // Cached 60s per token: with silence auto-end users reconnect often, and
      // the Supabase+Nylas round-trip is most of tap-to-listening latency.
      let systemPrompt;
      let tools = SONIC_TOOLS;
      const cached = contextCache.get(token);
      if (cached && Date.now() - cached.ts < CONTEXT_TTL_MS) {
        systemPrompt = cached.systemPrompt;
      } else {
        try {
          const data = await supabaseFn("voice-session", token, { tz, agentName: msg.agentName });
          systemPrompt = data.systemPrompt;
          contextCache.set(token, { systemPrompt, ts: Date.now() });
          if (contextCache.size > 200) {
            const oldest = [...contextCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
            contextCache.delete(oldest[0]);
          }
        } catch (e) {
          if (e.status === 401 || e.status === 403) {
            send({ type: "error", message: "Authentication failed — sign in again." });
            return;
          }
          console.error(`${tag} voice-session failed, using fallback prompt:`, e.message);
          systemPrompt = `${FALLBACK_PROMPT} Do not claim to have access to the user's email, calendar, tasks, or contacts. Do not call tools. Ask the user to try again in a moment.`;
          tools = [];
        }
      }

      // Sonic emits assistant text twice: a SPECULATIVE block while speaking,
      // then a FINAL block. Relay only one or the UI shows duplicates.
      let textStage = null;
      let sawSpeculative = false;

      // One staged action at a time; a new action tool call replaces it.
      let pendingAction = null;

      // Idempotency: the model sometimes re-issues a tool call it already made
      // (retry after a slow round, barge-in mid-confirmation). Same tool +
      // same args = one execution; repeats get the first call's result.
      const toolRuns = new Map();
      const runToolOnce = (toolName, args) => {
        const key = `${toolName}:${JSON.stringify(args, Object.keys(args).sort())}`;
        if (toolRuns.has(key)) {
          console.log(`${tag} tool ${toolName} duplicate suppressed`);
          return toolRuns.get(key);
        }
        const run = supabaseFn("voice-tools", token, { name: toolName, args, tz })
          .catch((e) => {
            console.error(`${tag} tool ${toolName} failed:`, e.message);
            toolRuns.delete(key); // real failures may be retried
            return { success: false, message: "The action failed due to a connection problem. Tell the user to try again." };
          });
        toolRuns.set(key, run);
        return run;
      };

      session = new SonicSession({
        region: AWS_REGION,
        voiceId: SONIC_VOICES.has(msg.voiceId) ? msg.voiceId : "matthew",
        systemPrompt,
        tools,
        onEvent: async (event) => {
          const kind = Object.keys(event)[0];
          if (kind === "audioOutput") {
            send({ type: "audio", data: event.audioOutput.content });
          } else if (kind === "contentStart" && event.contentStart.type === "TEXT") {
            textStage = null;
            try {
              textStage = JSON.parse(event.contentStart.additionalModelFields || "{}").generationStage ?? null;
            } catch { /* no stage info */ }
            if (event.contentStart.role === "USER") sawSpeculative = false; // new turn
            else if (textStage === "SPECULATIVE") sawSpeculative = true;
          } else if (kind === "textOutput") {
            const role = event.textOutput.role;
            const isDuplicateFinal = role === "ASSISTANT" && textStage === "FINAL" && sawSpeculative;
            if (!isDuplicateFinal) {
              send({ type: "transcript", role, text: event.textOutput.content });
            }
          } else if (kind === "toolUse") {
            const { toolUseId, toolName, content } = event.toolUse;
            send({ type: "toolUse", name: toolName });
            let args = {};
            try { args = typeof content === "string" ? JSON.parse(content) : (content ?? {}); } catch {}

            // CONFIRM GATE — server-enforced two-phase for every action.
            // An action tool call is only STAGED; nothing executes until the
            // user audibly confirms and the model calls confirm_action.
            if (toolName === "confirm_action") {
              if (!pendingAction) {
                session?.sendToolResult(toolUseId, { success: false, message: "There is no pending action to confirm. Ask the user what they'd like to do." });
                return;
              }
              const { name: actionName, args: actionArgs } = pendingAction;
              pendingAction = null;
              const result = await runToolOnce(actionName, actionArgs);
              console.log(`${tag} confirmed ${actionName} -> ${result.success ? "ok" : `fail: ${result.message}`}`);
              session?.sendToolResult(toolUseId, result);
              send({ type: "toolResult", name: actionName, success: !!result.success, message: result.message });
              return;
            }
            if (toolName === "cancel_action") {
              const had = pendingAction?.name;
              pendingAction = null;
              session?.sendToolResult(toolUseId, { success: true, message: had ? `${had} cancelled. Acknowledge briefly.` : "Nothing was pending." });
              console.log(`${tag} cancelled pending ${had ?? "(none)"}`);
              return;
            }

            // Read-only tools execute immediately — confirmation is for
            // actions that change something, not for looking things up.
            if (READ_TOOLS.has(toolName)) {
              const result = await runToolOnce(toolName, args);
              console.log(`${tag} read ${toolName} -> ${result.success ? "ok" : `fail: ${result.message}`}`);
              session?.sendToolResult(toolUseId, result);
              return;
            }

            // Every real action stages and waits for the spoken confirm.
            pendingAction = { name: toolName, args };
            console.log(`${tag} staged ${toolName} (awaiting confirm)`);
            session?.sendToolResult(toolUseId, {
              success: true,
              message:
                `PENDING — nothing has been done yet. Read the user the exact details of this ${toolName} in one or two short sentences (for emails: recipient, subject, and the gist of the body), then ask them to say confirm. ` +
                `When they say confirm, call confirm_action. If they decline, call cancel_action. If they ask for changes, call ${toolName} again with revised arguments (it replaces the pending one).`,
            });
          } else if (kind === "contentEnd" && event.contentEnd.stopReason === "INTERRUPTED") {
            send({ type: "interrupted" });
          }
        },
        onError: (e) => {
          console.error(`${tag} sonic error:`, e.name, e.message);
          send({ type: "error", message: "Voice connection dropped — tap the mic to restart." });
          teardown();
        },
        onClose: () => send({ type: "closed" }),
      });

      try {
        await session.start();
        session.startAudio();
        sessionTimer = setTimeout(() => {
          console.log(`${tag} session hit ${MAX_SESSION_MS / 60000}min cap`);
          send({ type: "error", message: "Voice session timed out — tap the mic to restart." });
          teardown();
        }, MAX_SESSION_MS);
        send({ type: "ready" });
        console.log(`${tag} session started (voice=${msg.voiceId || "matthew"}, tz=${tz})`);
      } catch (e) {
        console.error(`${tag} session start failed:`, e.message);
        send({ type: "error", message: "Could not start voice session. Try again." });
        teardown();
      }
    } else if (msg.type === "audio" && session) {
      session.sendAudioChunk(msg.data);
    } else if (msg.type === "stop") {
      teardown();
    }
  });

  ws.on("close", teardown);
  ws.on("error", teardown);

  // Heartbeat: kill dead sockets so Sonic streams don't leak
  const heartbeat = setInterval(() => {
    if (!alive) { clearInterval(heartbeat); teardown(); ws.terminate(); return; }
    alive = false;
    ws.ping();
  }, 30_000);
  ws.on("close", () => clearInterval(heartbeat));
});

httpServer.listen(PORT, () => {
  console.log(`voice-server: http://localhost:${PORT} (test page at /, health at /health), region ${AWS_REGION}`);
});
