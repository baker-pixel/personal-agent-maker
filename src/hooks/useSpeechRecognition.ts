import { useState, useCallback, useRef, useEffect } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { startTurn, markStage } from "@/lib/voiceLatency";

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  onSilenceTimeout?: () => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  lang?: string;
  silenceTimeoutMs?: number;
  /**
   * Push-to-talk mode: recording accumulates until stopAndSubmit() is called explicitly.
   * VAD still updates isSpeechActive for visual feedback but never auto-submits on silence.
   */
  pushToTalk?: boolean;
}

interface SpeechRecognitionReturn {
  isListening: boolean;
  isSpeechActive: boolean;
  isTranscribing: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  /** PTT only: stop the recorder and submit accumulated audio to STT (does not discard). */
  stopAndSubmit: () => void;
  toggleListening: () => void;
  isSupported: boolean;
  /** Store a pre-acquired MediaStream so startListening reuses it instead of calling getUserMedia again. */
  prewarmMic: (stream: MediaStream) => void;
}

// RMS of a byte time-domain buffer (values 0–255, center 128).
function rms(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

const SPEECH_THRESHOLD = 0.015;
const UTTERANCE_END_MS = 600; // silence after speech → send chunk
const VAD_INTERVAL_MS = 100;
// Hard cap on a single STT round-trip. A hung fetch (or hung auth refresh)
// would otherwise leave isTranscribing stuck true forever, disabling the UI.
const STT_TIMEOUT_MS = 15000;

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function transcribe(blob: Blob, lang: string, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, `audio.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
  if (lang) form.append("language", lang);

  markStage("stt_start");
  // authedFetch refreshes a stale post-resume token up front and retries once
  // on 401 — a resumed PWA otherwise fires this with an expired JWT and dies.
  const res = await authedFetch(`${SUPABASE_URL}/functions/v1/groq-stt`, {
    method: "POST",
    body: form,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `STT error ${res.status}`);
  }
  const json = await res.json();
  const text = (json.text ?? "").trim();
  if (text) markStage("stt_complete");
  return text;
}

export function useSpeechRecognition({
  onResult,
  onEnd,
  onSilenceTimeout,
  onError,
  continuous = true,
  lang = "en-US",
  silenceTimeoutMs = 0,
  pushToTalk = false,
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onSilenceTimeoutRef = useRef(onSilenceTimeout);
  const onErrorRef = useRef(onError);
  const langRef = useRef(lang);
  const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
  const continuousRef = useRef(continuous);
  const pushToTalkRef = useRef(pushToTalk);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onSilenceTimeoutRef.current = onSilenceTimeout; }, [onSilenceTimeout]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { silenceTimeoutMsRef.current = silenceTimeoutMs; }, [silenceTimeoutMs]);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);
  useEffect(() => { pushToTalkRef.current = pushToTalk; }, [pushToTalk]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Holds a stream acquired before the user taps Start — lets startListening
  // skip the getUserMedia call and avoids the iOS re-prompt cycle.
  const prewarmedStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasSpeechRef = useRef(false);
  const utteranceEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stopListeningRef = useRef<() => void>(() => {});

  // stoppingRef: true during explicit stopListening() until next startListening() — guards onstop from processing stale audio.
  const stoppingRef = useRef(false);
  // recorderGenRef: incremented on each stopListening() so stale onstop handlers from old recorder sessions are dropped.
  const recorderGenRef = useRef(0);
  const isListeningRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof window.AudioContext !== "undefined";

  const clearTimers = useCallback(() => {
    if (utteranceEndTimerRef.current) { clearTimeout(utteranceEndTimerRef.current); utteranceEndTimerRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const armSilenceTimer = useCallback(() => {
    // PTT: user controls start/stop — no idle silence timeout
    if (pushToTalkRef.current) return;
    const ms = silenceTimeoutMsRef.current;
    if (!ms || ms <= 0) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      onSilenceTimeoutRef.current?.();
    }, ms);
  }, []);

  const submitChunk = useCallback(() => {
    if (utteranceEndTimerRef.current) { clearTimeout(utteranceEndTimerRef.current); utteranceEndTimerRef.current = null; }
    hasSpeechRef.current = false;
    setIsSpeechActive(false);

    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    startTurn();
    markStage("utterance_end");
    mr.stop();
  }, []);

  const startRecorder = useCallback((stream: MediaStream) => {
    chunksRef.current = [];
    hasSpeechRef.current = false;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

    const myGen = recorderGenRef.current;
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      const chunks = chunksRef.current.splice(0);
      const mT = mr.mimeType || "audio/webm";

      // Drop if stopListening() was called (stale session) or a newer recorder gen exists.
      if (stoppingRef.current || recorderGenRef.current !== myGen) return;

      const blob = new Blob(chunks, { type: mT });
      if (blob.size < 1000) {
        if (pushToTalkRef.current) {
          // PTT: user explicitly submitted — surface that nothing was captured
          // instead of failing silently.
          onErrorRef.current?.("no-speech");
        } else if (isListeningRef.current && streamRef.current) {
          startRecorder(streamRef.current);
        }
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setIsTranscribing(true);

      // Watchdog: race the STT round-trip against a hard timeout. Covers both a
      // hung fetch and a hung getSession() so isTranscribing always resets.
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const sttTimeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          abort.abort();
          reject(new Error("stt-timeout"));
        }, STT_TIMEOUT_MS);
      });

      try {
        const text = await Promise.race([transcribe(blob, langRef.current, abort.signal), sttTimeout]);
        if (abort.signal.aborted) return;
        // Re-check after async gap: stopListening() or a new session may have started.
        if (stoppingRef.current || recorderGenRef.current !== myGen) return;
        // Filter Whisper hallucinations: silence, room noise, and TTS echo all
        // produce recognizable false-positive phrases. Drop them before onResult.
        const normalized = text.trim().toLowerCase().replace(/[.!?,;…\s]+$/, "").replace(/^[.!?,;…\s]+/, "");
        // Junk that's never real speech regardless of mode
        const isJunk =
          // No alphabetic content at all (pure punctuation / digits)
          !/[a-zA-Z]/.test(text) ||
          // Whisper metadata tags: [Music], [Applause], [BLANK_AUDIO], (silence), etc.
          /^\[.*\]$/.test(text.trim()) ||
          /^\(.*\)$/.test(text.trim()) ||
          // Common Whisper silence hallucinations
          /^(thank you for watching|thanks for watching|please subscribe|like and subscribe|don'?t forget to subscribe|see you next time|see you in the next video|have a nice day|you'?re welcome|take care|good luck|goodbye|good bye|i'?ll see you|until next time|this video|that'?s all|stay tuned|keep watching|music playing|background music)$/i.test(normalized);
        // Echo/backchannel filters only apply in hands-free mode. In PTT the user
        // deliberately recorded and submitted — short answers like "yes" are real.
        const isHallucination = isJunk || (!pushToTalkRef.current && (
          // Too short to be real speech
          text.length < 4 ||
          // Single filler words / backchannels
          /^(you|thanks?|thank you|ok|okay|hmm+|uh+|ah+|um+|er+|oh|hm+|ah|eh|right|sure|yes|no|bye|hi|hey|alright|yep|nope|cool|great|wow|well|so|and|the|a)$/i.test(normalized)
        ));
        if (text && !isHallucination) {
          setTranscript(text);
          onResultRef.current?.(text);
          armSilenceTimer();
        } else if (pushToTalkRef.current) {
          // PTT: deliberate submit produced nothing usable — tell the user
          onErrorRef.current?.("no-speech");
        }
      } catch (err: any) {
        if (timedOut || err?.message === "stt-timeout") {
          console.warn("[STT] transcription timed out after", STT_TIMEOUT_MS, "ms");
          onErrorRef.current?.("stt-timeout");
          return;
        }
        if (err?.name === "AbortError") return;
        console.error("STT transcription error:", err);
        onErrorRef.current?.(err?.message ?? "network");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        setIsTranscribing(false);
        if (!continuousRef.current) {
          stopListeningRef.current();
        } else if (!pushToTalkRef.current && isListeningRef.current && streamRef.current && !stoppingRef.current && recorderGenRef.current === myGen) {
          // Hands-free only: PTT never auto-restarts the recorder — doing so could
          // double-start when the user began a new turn while STT was in flight.
          startRecorder(streamRef.current);
        }
      }
    };

    mr.start();
  }, [armSilenceTimer]);

  /**
   * PTT stop: halts recording and lets onstop submit the audio to STT.
   * Unlike stopListening(), this does NOT set stoppingRef or increment gen,
   * so the onstop handler runs and calls onResult with the transcript.
   */
  const stopAndSubmit = useCallback(() => {
    if (!isListeningRef.current) return;
    clearTimers();
    isListeningRef.current = false;
    setIsListening(false);
    setIsSpeechActive(false);
    hasSpeechRef.current = false;
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    // stoppingRef stays false + gen stays same → onstop processes + transcribes the audio
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* ignore */ }
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setTranscript("");
  }, [clearTimers]);

  const stopListening = useCallback(() => {
    stoppingRef.current = true;
    recorderGenRef.current++;   // invalidate all pending onstop handlers
    isListeningRef.current = false;
    setIsListening(false);
    setIsSpeechActive(false);
    clearTimers();

    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
      analyserRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setTranscript("");
    // stoppingRef stays true until startListening() resets it — ensures any onstop
    // that fires async after this call drops its audio instead of submitting it.
  }, [clearTimers]);

  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  const startListening = useCallback(() => {
    if (isListeningRef.current) return;
    if (!isSupported) { onErrorRef.current?.("not-supported"); return; }

    stoppingRef.current = false;
    // Cancel any in-flight transcription — the user starting a new turn
    // supersedes a pending (possibly stuck) STT request.
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    isListeningRef.current = true;
    setIsListening(true);
    setIsSpeechActive(false);
    setTranscript("");
    hasSpeechRef.current = false;
    armSilenceTimer();

    const micPromise = prewarmedStreamRef.current
      ? Promise.resolve(prewarmedStreamRef.current)
      : navigator.mediaDevices.getUserMedia({ audio: true });
    prewarmedStreamRef.current = null;

    micPromise.then((stream) => {
      if (stoppingRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const vadBuf = new Uint8Array(analyser.frequencyBinCount);
      startRecorder(stream);

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || stoppingRef.current) return;
        analyserRef.current.getByteTimeDomainData(vadBuf);
        const level = rms(vadBuf);

        if (level > SPEECH_THRESHOLD) {
          // Cancel idle-silence timer; reset it so we count from last speech.
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          armSilenceTimer();
          if (utteranceEndTimerRef.current) { clearTimeout(utteranceEndTimerRef.current); utteranceEndTimerRef.current = null; }
          if (!hasSpeechRef.current) {
            // Speech onset — signal immediately so barge-in can react.
            hasSpeechRef.current = true;
            setIsSpeechActive(true);
          }
        } else if (hasSpeechRef.current && !utteranceEndTimerRef.current && !pushToTalkRef.current) {
          // VAD auto-submit on silence — disabled in PTT mode (user presses stop explicitly)
          utteranceEndTimerRef.current = setTimeout(() => {
            utteranceEndTimerRef.current = null;
            submitChunk();
          }, UTTERANCE_END_MS);
        }
      }, VAD_INTERVAL_MS);
    }).catch((err: any) => {
      isListeningRef.current = false;
      setIsListening(false);
      const code = err?.name === "NotAllowedError" ? "not-allowed" : "audio-capture";
      onErrorRef.current?.(code);
    });
  }, [isSupported, armSilenceTimer, startRecorder, submitChunk]);

  const prewarmMic = useCallback((stream: MediaStream) => {
    // Discard any previous pre-warmed stream before storing the new one.
    prewarmedStreamRef.current?.getTracks().forEach(t => t.stop());
    prewarmedStreamRef.current = stream;
  }, []);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) stopListening();
    else startListening();
  }, [startListening, stopListening]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      clearTimers();
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* ignore */ } }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (prewarmedStreamRef.current) { prewarmedStreamRef.current.getTracks().forEach(t => t.stop()); prewarmedStreamRef.current = null; }
    };
  }, [clearTimers]);

  return { isListening, isSpeechActive, transcript, isTranscribing, startListening, stopListening, stopAndSubmit, toggleListening, isSupported, prewarmMic };
}
