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
// Nova 2 Sonic voice catalog — tiffany/matthew are polyglot.
const SONIC_VOICES = new Set([
  "tiffany", "matthew", "amy", "olivia", "kiara", "arjun",
  "ambre", "florian", "beatrice", "lorenzo", "tina", "lennart",
  "lupe", "carlos", "carolina", "leo",
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

const httpServer = createServer((req, res) => {
  if (req.url === "/" || req.url === "/test") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "test-client.html")));
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, region: AWS_REGION }));
  } else {
    res.writeHead(404); res.end();
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
