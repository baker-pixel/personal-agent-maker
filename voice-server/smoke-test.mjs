// Smoke test: open Sonic stream, send system + user text, expect text/audio back.
// Verifies credentials, model access, and the bidirectional event protocol — no mic needed.
import "dotenv/config";
import { SonicSession } from "./sonic-session.mjs";

let gotText = "";
let audioBytes = 0;

const session = new SonicSession({
  region: process.env.AWS_REGION,
  systemPrompt: "You are a terse voice assistant. Reply in one short sentence.",
  onEvent: (event) => {
    const kind = Object.keys(event)[0];
    if (kind === "textOutput") {
      gotText += event.textOutput.content ?? "";
      console.log(`[text:${event.textOutput.role ?? "?"}]`, event.textOutput.content);
    } else if (kind === "audioOutput") {
      audioBytes += Buffer.from(event.audioOutput.content, "base64").length;
    } else if (kind === "completionEnd") {
      console.log(`\nPASS — text received, audio bytes: ${audioBytes}`);
      session.end();
      setTimeout(() => process.exit(0), 500);
    } else if (!["audioOutput"].includes(kind)) {
      console.log(`[event] ${kind}`);
    }
  },
  onError: (e) => {
    console.error("STREAM ERROR:", e.name, e.message);
    process.exit(1);
  },
  onClose: () => {
    if (audioBytes > 0) process.exit(0);
  },
});

console.log(`Opening Nova 2 Sonic stream in ${process.env.AWS_REGION}…`);
await session.start();

// Stream a spoken test utterance (16kHz LE16 mono WAV from `say`), then
// trailing silence so Sonic's server-side VAD detects end of speech.
import { readFileSync } from "node:fs";
const wav = readFileSync("./test-utterance.wav");
const pcm = wav.subarray(44); // skip WAV header
const CHUNK = 1024; // 32ms at 16kHz/16-bit
session.startAudio();
for (let i = 0; i < pcm.length; i += CHUNK) {
  session.sendAudioChunk(pcm.subarray(i, i + CHUNK).toString("base64"));
  await new Promise((r) => setTimeout(r, 25));
}
const silence = Buffer.alloc(CHUNK);
for (let i = 0; i < 60; i++) {
  session.sendAudioChunk(silence.toString("base64"));
  await new Promise((r) => setTimeout(r, 25));
}

setTimeout(() => {
  console.error(`TIMEOUT after 30s — text so far: "${gotText}", audio bytes: ${audioBytes}`);
  process.exit(audioBytes > 0 ? 0 : 1);
}, 30_000);
