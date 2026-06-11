// Tool-calling smoke test: speak a task request, expect a toolUse event for
// create_task, answer with a fake success, expect a spoken confirmation.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { SonicSession } from "./sonic-session.mjs";
import { SONIC_TOOLS } from "./tools.mjs";

execSync(`say -o tool-utterance.wav --data-format=LEI16@16000 "Create a task called buy milk with high priority"`);

let toolUseSeen = null;
let confirmText = "";
let audioBytes = 0;

const session = new SonicSession({
  region: process.env.AWS_REGION,
  systemPrompt: "You are a terse voice assistant. When asked to create a task, call the create_task tool, then confirm in one short sentence.",
  tools: SONIC_TOOLS,
  onEvent: (event) => {
    const kind = Object.keys(event)[0];
    if (kind === "toolUse") {
      const { toolUseId, toolName, content } = event.toolUse;
      toolUseSeen = { toolName, args: content };
      console.log(`[toolUse] ${toolName} args=${content}`);
      session.sendToolResult(toolUseId, { success: true, message: 'Task "buy milk" created' });
    } else if (kind === "textOutput") {
      const role = event.textOutput.role;
      console.log(`[text:${role}]`, event.textOutput.content);
      if (role === "ASSISTANT" && toolUseSeen) confirmText += event.textOutput.content;
    } else if (kind === "audioOutput") {
      audioBytes += Buffer.from(event.audioOutput.content, "base64").length;
    }
  },
  onError: (e) => { console.error("STREAM ERROR:", e.name, e.message); process.exit(1); },
  onClose: () => {},
});

console.log(`Opening stream in ${process.env.AWS_REGION} with ${SONIC_TOOLS.length} tools…`);
await session.start();

const wav = readFileSync("./tool-utterance.wav");
const pcm = wav.subarray(44);
const CHUNK = 1024;
session.startAudio();
for (let i = 0; i < pcm.length; i += CHUNK) {
  session.sendAudioChunk(pcm.subarray(i, i + CHUNK).toString("base64"));
  await new Promise((r) => setTimeout(r, 25));
}
const silence = Buffer.alloc(CHUNK);
const until = Date.now() + 40_000;
const poll = setInterval(() => {
  session.sendAudioChunk(silence.toString("base64"));
  if (toolUseSeen && confirmText) {
    clearInterval(poll);
    console.log(`\nPASS — tool: ${toolUseSeen.toolName}, confirmation: "${confirmText}", audio bytes: ${audioBytes}`);
    session.end();
    setTimeout(() => process.exit(0), 300);
  } else if (Date.now() > until) {
    clearInterval(poll);
    console.error(`\nFAIL — toolUse: ${JSON.stringify(toolUseSeen)}, confirm: "${confirmText}"`);
    process.exit(1);
  }
}, 25);
