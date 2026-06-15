// Wraps one Nova 2 Sonic bidirectional stream over Bedrock.
// Protocol ref: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.html
import { randomUUID } from "node:crypto";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";

const MODEL_ID = "amazon.nova-2-sonic-v1:0";

export class SonicSession {
  constructor({ region, voiceId = "matthew", systemPrompt = "", tools = [], onEvent, onError, onClose }) {
    this.region = region;
    this.voiceId = voiceId;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.onEvent = onEvent;
    this.onError = onError ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.promptName = randomUUID();
    this.audioContentName = null;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
  }

  // ---- outgoing event plumbing ----
  enqueue(event) {
    if (this.closed) return;
    this.queue.push(event);
    const w = this.waiters.shift();
    if (w) w();
  }

  async *eventStream() {
    while (true) {
      while (this.queue.length === 0 && !this.closed) {
        await new Promise((resolve) => this.waiters.push(resolve));
      }
      if (this.queue.length === 0 && this.closed) return;
      const event = this.queue.shift();
      yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(event)) } };
    }
  }

  // ---- session lifecycle ----
  async start() {
    this.client = new BedrockRuntimeClient({
      region: this.region,
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 300_000,
        sessionTimeout: 300_000,
      }),
    });

    this.enqueue({
      event: {
        sessionStart: {
          // 512 gives headroom for email readouts (~380 words spoken); still
          // caps cost on short turns where the model stops naturally earlier.
          inferenceConfiguration: { maxTokens: 512, topP: 0.9, temperature: 0.7 },
          // LOW = waits ~2s of silence before treating the user's turn as done.
          // HIGH/MEDIUM cut off slower or pausing speakers mid-sentence.
          turnDetectionConfiguration: { endpointingSensitivity: "LOW" },
        },
      },
    });
    this.enqueue({
      event: {
        promptStart: {
          promptName: this.promptName,
          textOutputConfiguration: { mediaType: "text/plain" },
          audioOutputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            voiceId: this.voiceId,
            encoding: "base64",
            audioType: "SPEECH",
          },
          toolUseOutputConfiguration: { mediaType: "application/json" },
          ...(this.tools.length > 0 ? { toolConfiguration: { tools: this.tools } } : {}),
        },
      },
    });
    if (this.systemPrompt) this.sendText("SYSTEM", this.systemPrompt);

    const command = new InvokeModelWithBidirectionalStreamCommand({
      modelId: MODEL_ID,
      body: this.eventStream(),
    });

    const response = await this.client.send(command);
    this.readLoop(response).catch((e) => this.onError(e));
  }

  async readLoop(response) {
    try {
      for await (const item of response.body) {
        if (!item.chunk?.bytes) continue;
        const parsed = JSON.parse(new TextDecoder().decode(item.chunk.bytes));
        this.onEvent(parsed.event ?? parsed);
      }
    } finally {
      this.closed = true;
      this.onClose();
    }
  }

  // ---- content helpers ----
  sendText(role, content) {
    const contentName = randomUUID();
    this.enqueue({
      event: {
        contentStart: {
          promptName: this.promptName,
          contentName,
          type: "TEXT",
          interactive: true,
          role,
          textInputConfiguration: { mediaType: "text/plain" },
        },
      },
    });
    this.enqueue({ event: { textInput: { promptName: this.promptName, contentName, content } } });
    this.enqueue({ event: { contentEnd: { promptName: this.promptName, contentName } } });
  }

  startAudio() {
    this.audioContentName = randomUUID();
    this.enqueue({
      event: {
        contentStart: {
          promptName: this.promptName,
          contentName: this.audioContentName,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: 16000,
            sampleSizeBits: 16,
            channelCount: 1,
            audioType: "SPEECH",
            encoding: "base64",
          },
        },
      },
    });
  }

  sendAudioChunk(base64) {
    if (!this.audioContentName) this.startAudio();
    this.enqueue({ event: { audioInput: { promptName: this.promptName, contentName: this.audioContentName, content: base64 } } });
  }

  endAudio() {
    if (!this.audioContentName) return;
    this.enqueue({ event: { contentEnd: { promptName: this.promptName, contentName: this.audioContentName } } });
    this.audioContentName = null;
  }

  sendToolResult(toolUseId, result) {
    const contentName = randomUUID();
    this.enqueue({
      event: {
        contentStart: {
          promptName: this.promptName,
          contentName,
          type: "TOOL",
          interactive: false,
          role: "TOOL",
          toolResultInputConfiguration: {
            toolUseId,
            type: "TEXT",
            textInputConfiguration: { mediaType: "text/plain" },
          },
        },
      },
    });
    this.enqueue({
      event: {
        toolResult: {
          promptName: this.promptName,
          contentName,
          content: typeof result === "string" ? result : JSON.stringify(result),
        },
      },
    });
    this.enqueue({ event: { contentEnd: { promptName: this.promptName, contentName } } });
  }

  end() {
    if (this.closed) return;
    this.endAudio();
    this.enqueue({ event: { promptEnd: { promptName: this.promptName } } });
    this.enqueue({ event: { sessionEnd: {} } });
    this.closed = true;
    const w = this.waiters.shift();
    if (w) w();
  }
}
