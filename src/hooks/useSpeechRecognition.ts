import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startTurn, markStage } from "@/lib/voiceLatency";

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  onSilenceTimeout?: () => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  lang?: string;
  silenceTimeoutMs?: number;
}

interface SpeechRecognitionReturn {
  isListening: boolean;
  isSpeechActive: boolean; // true the moment VAD detects speech onset; false after utterance submitted
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  isSupported: boolean;
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

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;

async function transcribe(blob: Blob, lang: string, signal: AbortSignal): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const form = new FormData();
  form.append("audio", blob, `audio.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
  if (lang) form.append("language", lang);

  markStage("stt_start");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/groq-stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
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
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [transcript, setTranscript] = useState("");

  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onSilenceTimeoutRef = useRef(onSilenceTimeout);
  const onErrorRef = useRef(onError);
  const langRef = useRef(lang);
  const silenceTimeoutMsRef = useRef(silenceTimeoutMs);
  const continuousRef = useRef(continuous);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onSilenceTimeoutRef.current = onSilenceTimeout; }, [onSilenceTimeout]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { silenceTimeoutMsRef.current = silenceTimeoutMs; }, [silenceTimeoutMs]);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasSpeechRef = useRef(false);
  const utteranceEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stopListeningRef = useRef<() => void>(() => {});

  // stoppingRef: true only during an explicit stopListening() call — guards onstop from restarting.
  const stoppingRef = useRef(false);
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

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      const chunks = chunksRef.current.splice(0);
      const mT = mr.mimeType || "audio/webm";

      if (stoppingRef.current) return;

      const blob = new Blob(chunks, { type: mT });
      if (blob.size < 1000) {
        if (isListeningRef.current && streamRef.current) startRecorder(streamRef.current);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const text = await transcribe(blob, langRef.current, abort.signal);
        if (abort.signal.aborted) return;
        if (text) {
          setTranscript(text);
          onResultRef.current?.(text);
          armSilenceTimer();
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("STT transcription error:", err);
        onErrorRef.current?.(err?.message ?? "network");
      } finally {
        if (!continuousRef.current) {
          stopListeningRef.current();
        } else if (isListeningRef.current && streamRef.current && !stoppingRef.current) {
          startRecorder(streamRef.current);
        }
      }
    };

    mr.start();
  }, [armSilenceTimer]);

  const stopListening = useCallback(() => {
    stoppingRef.current = true;
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
    setTimeout(() => { stoppingRef.current = false; }, 0);
    // Only fire onEnd for unexpected terminations (not explicit stops), matching
    // the old Web Speech API behaviour where stoppingRef suppressed onend.
  }, [clearTimers]);

  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  const startListening = useCallback(() => {
    if (isListeningRef.current) return;
    if (!isSupported) { onErrorRef.current?.("not-supported"); return; }

    stoppingRef.current = false;
    isListeningRef.current = true;
    setIsListening(true);
    setIsSpeechActive(false);
    setTranscript("");
    hasSpeechRef.current = false;
    armSilenceTimer();

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
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
        } else if (hasSpeechRef.current && !utteranceEndTimerRef.current) {
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
    };
  }, [clearTimers]);

  return { isListening, isSpeechActive, transcript, startListening, stopListening, toggleListening, isSupported };
}
