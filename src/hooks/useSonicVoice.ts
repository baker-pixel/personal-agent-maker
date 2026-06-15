import { useCallback, useEffect, useRef, useState } from "react";
import { getFreshAccessToken } from "@/lib/authedFetch";
import { useVoicePreferences } from "./useVoicePreferences";
import { sonicToGroqVoiceId } from "@/lib/sonicVoices";

const VOICE_SERVER_URL: string | undefined = import.meta.env.VITE_VOICE_SERVER_URL;

/** True when the Nova Sonic speech-to-speech engine is configured. */
export const sonicEnabled = (): boolean =>
  typeof VOICE_SERVER_URL === "string" && VOICE_SERVER_URL.length > 0;

interface UseSonicVoiceOpts {
  agentName?: string;
  /** Final transcript of each turn, both sides ("USER" | "ASSISTANT"). */
  onTranscript?: (role: "USER" | "ASSISTANT", text: string) => void;
  /** Tool lifecycle, for UI affordances. */
  onToolEvent?: (e: { name: string; phase: "start" | "done"; success?: boolean; message?: string }) => void;
  /** Session auto-ended after prolonged silence. */
  onAutoEnd?: () => void;
}

// End the session after this much silence (no user speech, no agent audio).
// 45s — user needs time to process a long email readout before replying.
const SILENCE_END_MS = 45_000;
// Same RMS speech threshold the Groq pipeline used.
const SPEECH_RMS = 0.02;

/**
 * Hands-free voice conversation over Amazon Nova 2 Sonic. One WebSocket to the
 * voice server carries mic audio up (16 kHz LE16) and TTS audio down (24 kHz).
 * STT, VAD, barge-in, and tool calling all happen server-side — this hook only
 * moves audio and surfaces state.
 */
export function useSonicVoice(opts: UseSonicVoiceOpts = {}) {
  const [conversationActive, setConversationActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-user Sonic voice preference (16 Nova voices). Refs so the async
  // startConversation reads current values, not stale closures.
  const { prefs: voicePrefs, loaded: prefsLoaded, update: updateVoicePrefs } = useVoicePreferences();
  const voiceIdRef = useRef(voicePrefs.sonic_voice_id);
  const prefsLoadedRef = useRef(prefsLoaded);
  useEffect(() => { voiceIdRef.current = voicePrefs.sonic_voice_id; }, [voicePrefs.sonic_voice_id]);
  useEffect(() => { prefsLoadedRef.current = prefsLoaded; }, [prefsLoaded]);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playHeadRef = useRef(0);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const activeRef = useRef(false);
  const lastActivityRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const stopPlayback = useCallback(() => {
    for (const s of liveSourcesRef.current) { try { s.stop(); } catch { /* already stopped */ } }
    liveSourcesRef.current.clear();
    if (playCtxRef.current) playHeadRef.current = playCtxRef.current.currentTime;
    setIsSpeaking(false);
  }, []);

  const stopConversation = useCallback(() => {
    activeRef.current = false;
    setConversationActive(false);
    setIsConnecting(false);
    if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = null; }
    try { wsRef.current?.send(JSON.stringify({ type: "stop" })); } catch { /* socket gone */ }
    wsRef.current?.close();
    wsRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    stopPlayback();
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
  }, [stopPlayback]);

  const playChunk = useCallback((base64: string) => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    // Hot path — runs for every audio chunk while the agent speaks. Manual
    // decode (no per-element callbacks) keeps mobile main threads smooth.
    const bin = atob(base64);
    const f32 = new Float32Array(bin.length >> 1);
    for (let i = 0; i < f32.length; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      f32[i] = v / 32768;
    }
    if (f32.length === 0) return;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    playHeadRef.current = Math.max(playHeadRef.current, ctx.currentTime);
    src.start(playHeadRef.current);
    playHeadRef.current += buf.duration;
    lastActivityRef.current = Date.now(); // agent speech counts as activity
    const wasSilent = liveSourcesRef.current.size === 0;
    liveSourcesRef.current.add(src);
    if (wasSilent) setIsSpeaking(true); // one render per burst, not per chunk
    src.onended = () => {
      liveSourcesRef.current.delete(src);
      if (liveSourcesRef.current.size === 0) {
        setIsSpeaking(false);
        // Start 45s silence window from when agent finishes speaking,
        // not from when chunks arrived (they can precede playback).
        lastActivityRef.current = Date.now();
      }
    };
  }, []);

  const startConversation = useCallback(async () => {
    if (activeRef.current || !sonicEnabled()) return;
    setError(null);
    activeRef.current = true;
    setIsConnecting(true);

    try {
      // Everything slow runs in parallel: auth token, mic permission+stream,
      // WebSocket dial, and (server-side) context build + Bedrock stream.
      // Audio capture is armed while the session connects; shipPcm holds
      // chunks back until the server says ready.
      const sessionReady = { current: false };
      const tokenP = getFreshAccessToken();
      const micP = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const wsUrl = VOICE_SERVER_URL!.replace(/^http/, "ws");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Voice server timed out")), 15000);
        ws.addEventListener("message", function onMsg(e) {
          const m = JSON.parse(e.data as string);
          if (m.type === "ready") { clearTimeout(timer); ws.removeEventListener("message", onMsg); resolve(); }
          if (m.type === "error") { clearTimeout(timer); ws.removeEventListener("message", onMsg); reject(new Error(m.message)); }
        });
        ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not reach voice server")); });
      });

      ws.addEventListener("open", async () => {
        // Fetch token and wait for voice prefs in parallel. WS open fires in
        // ~150ms but the DB prefs fetch takes ~300-500ms — without this wait,
        // voiceIdRef.current is still the default and the wrong voice plays.
        const token = await tokenP;
        if (!prefsLoadedRef.current) {
          await new Promise<void>((resolve) => {
            const iv = setInterval(() => { if (prefsLoadedRef.current) { clearInterval(iv); resolve(); } }, 50);
            setTimeout(() => { clearInterval(iv); resolve(); }, 3000);
          });
        }
        ws.send(JSON.stringify({
          type: "start",
          token,
          agentName: optsRef.current.agentName,
          voiceId: voiceIdRef.current,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }));
      });

      ws.addEventListener("message", (e) => {
        const m = JSON.parse(e.data as string);
        if (m.type === "audio") playChunk(m.data);
        else if (m.type === "transcript") optsRef.current.onTranscript?.(m.role, m.text);
        else if (m.type === "interrupted") stopPlayback();
        else if (m.type === "toolUse") optsRef.current.onToolEvent?.({ name: m.name, phase: "start" });
        else if (m.type === "toolResult") optsRef.current.onToolEvent?.({ name: m.name, phase: "done", success: m.success, message: m.message });
        else if (m.type === "error") { setError(m.message); stopConversation(); }
        else if (m.type === "closed" && activeRef.current) stopConversation();
      });

      ws.addEventListener("close", () => { if (activeRef.current) stopConversation(); });

      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playHeadRef.current = playCtxRef.current.currentTime;

      const stream = await micP;
      micStreamRef.current = stream;
      const micCtx = new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const srcNode = micCtx.createMediaStreamSource(stream);
      // Some browsers ignore the 16 kHz request — decimate to 16 kHz if so.
      const ratio = micCtx.sampleRate / 16000;
      const shipPcm = (f32: Float32Array) => {
        if (!activeRef.current || !sessionReady.current || ws.readyState !== WebSocket.OPEN) return;
        let sumSq = 0;
        for (let i = 0; i < f32.length; i++) sumSq += f32[i] * f32[i];
        if (Math.sqrt(sumSq / f32.length) > SPEECH_RMS) lastActivityRef.current = Date.now();
        const outLen = Math.floor(f32.length / ratio);
        const i16 = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const v = f32[Math.floor(i * ratio)];
          i16[i] = Math.max(-32768, Math.min(32767, v * 32768));
        }
        // Batch conversion — char-by-char string concat re-allocates the
        // string every iteration and visibly stalls mobile main threads.
        const u8 = new Uint8Array(i16.buffer);
        let bin = "";
        const STRIDE = 0x8000;
        for (let i = 0; i < u8.length; i += STRIDE) {
          bin += String.fromCharCode(...u8.subarray(i, i + STRIDE));
        }
        ws.send(JSON.stringify({ type: "audio", data: btoa(bin) }));
      };

      try {
        // AudioWorklet path: capture runs off the main thread; the processor
        // batches 128-frame render quanta into ~2048-sample chunks.
        const workletSrc = `
          class PcmCapture extends AudioWorkletProcessor {
            constructor() { super(); this.chunks = []; this.length = 0; }
            process(inputs) {
              const ch = inputs[0] && inputs[0][0];
              if (ch) {
                this.chunks.push(new Float32Array(ch));
                this.length += ch.length;
                if (this.length >= 2048) {
                  const all = new Float32Array(this.length);
                  let o = 0;
                  for (const c of this.chunks) { all.set(c, o); o += c.length; }
                  this.port.postMessage(all, [all.buffer]);
                  this.chunks = []; this.length = 0;
                }
              }
              return true;
            }
          }
          registerProcessor("pcm-capture", PcmCapture);
        `;
        const moduleUrl = URL.createObjectURL(new Blob([workletSrc], { type: "application/javascript" }));
        try {
          await micCtx.audioWorklet.addModule(moduleUrl);
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
        const worklet = new AudioWorkletNode(micCtx, "pcm-capture", {
          numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1,
        });
        worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => shipPcm(ev.data);
        srcNode.connect(worklet);
      } catch {
        // Fallback for browsers without AudioWorklet (old Safari): deprecated
        // ScriptProcessor still works everywhere.
        const proc = micCtx.createScriptProcessor(2048, 1, 1);
        proc.onaudioprocess = (ev) => shipPcm(ev.inputBuffer.getChannelData(0));
        srcNode.connect(proc);
        proc.connect(micCtx.destination);
      }

      // Mic is armed; unblock audio shipping the moment the session is live.
      await ready;
      sessionReady.current = true;

      // Auto-end after sustained silence — nobody said anything for SILENCE_END_MS.
      lastActivityRef.current = Date.now();
      idleTimerRef.current = setInterval(() => {
        // Don't timeout while agent audio is still playing — chunks can arrive
        // faster than playback, so checking liveSourcesRef is more accurate
        // than relying on lastActivityRef being set in playChunk.
        if (liveSourcesRef.current.size > 0) {
          lastActivityRef.current = Date.now();
          return;
        }
        if (Date.now() - lastActivityRef.current > SILENCE_END_MS) {
          optsRef.current.onAutoEnd?.();
          stopConversation();
        }
      }, 5000);

      setConversationActive(true);
      setIsConnecting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice failed to start");
      stopConversation();
    }
  }, [playChunk, stopPlayback, stopConversation]);

  const toggleConversation = useCallback(() => {
    if (activeRef.current) stopConversation();
    else void startConversation();
  }, [startConversation, stopConversation]);

  useEffect(() => stopConversation, [stopConversation]); // unmount cleanup

  return {
    enabled: sonicEnabled(),
    conversationActive,
    /** Session is starting up (mic + WS + Bedrock handshake) — mic not live yet. */
    isConnecting,
    /** Mic is always open during an active Sonic session. */
    isListening: conversationActive && !isSpeaking,
    isSpeaking,
    error,
    startConversation,
    stopConversation,
    toggleConversation,
    /** Sonic voice (per-user pref). Takes effect on the next session start. */
    sonicVoiceId: voicePrefs.sonic_voice_id,
    // Keep the Groq readout voice gender-matched to the picked Nova voice.
    setSonicVoiceId: (id: string) =>
      updateVoicePrefs({ sonic_voice_id: id, tts_groq_voice_id: sonicToGroqVoiceId(id) }),
  };
}
