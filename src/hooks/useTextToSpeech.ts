import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_GROQ_VOICE } from "@/lib/groqVoices";
import { markStage } from "@/lib/voiceLatency";

const VOICE_KEY = "normy_tts_voice";
const RATE_KEY = "normy_tts_rate";
const PITCH_KEY = "normy_tts_pitch";

export type TtsProvider = "browser" | "groq";

interface TtsRemoteOpts {
  remote?: {
    voiceURI: string | null;
    rate: number;
    pitch: number;
    enabled: boolean;
    loaded: boolean;
    provider?: TtsProvider;
    groqVoiceId?: string | null;
  };
  onChange?: (patch: {
    tts_voice_uri?: string | null;
    tts_rate?: number;
    tts_pitch?: number;
    tts_enabled?: boolean;
    tts_provider?: TtsProvider;
    tts_groq_voice_id?: string | null;
  }) => void;
}

// Split text into sentence chunks. All chunks are fetched in parallel so
// playback of chunk 1 starts while chunks 2+ are still being generated.
function splitSentences(text: string, maxLen = 220): string[] {
  if (text.length <= maxLen) return [text];
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const part of parts) {
    const candidate = cur ? cur + ' ' + part : part;
    if (cur && candidate.length > maxLen) {
      chunks.push(cur.trim());
      cur = part;
    } else {
      cur = candidate;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

export function useTextToSpeech(opts: TtsRemoteOpts = {}) {
  const { remote, onChange } = opts;
  const [enabled, setEnabledState] = useState(() => {
    return localStorage.getItem("normy_tts_enabled") === "true";
  });
  const [isSpeaking, setIsSpeakingState] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => localStorage.getItem(VOICE_KEY));
  const [rate, setRateState] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(RATE_KEY) || "1.05");
    return isNaN(v) ? 1.05 : v;
  });
  const [pitch, setPitchState] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem(PITCH_KEY) || "1.0");
    return isNaN(v) ? 1.0 : v;
  });
  // Groq (premium) is the product default; browser speechSynthesis is only a
  // runtime fallback when the Groq pipeline fails or audio is blocked.
  const [provider, setProviderState] = useState<TtsProvider>("groq");
  const [groqVoiceId, setGroqVoiceIdState] = useState<string | null>(DEFAULT_GROQ_VOICE);

  // Sync from remote prefs whenever they change, per field, until the user
  // edits that field in THIS surface. A one-shot hydrate is not enough (the
  // first "loaded" snapshot can be stale), and a single global edit flag is
  // worse: startConversation() auto-enables TTS via toggle(), and when that
  // landed before the prefs fetch the flag blocked the user's real provider/
  // voice from ever syncing — the session ran on defaults and went silent.
  const editedFieldsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!remote?.loaded) return;
    const edited = editedFieldsRef.current;
    if (!edited.has("voiceURI")) setVoiceURIState(remote.voiceURI);
    if (!edited.has("rate")) setRateState(remote.rate);
    if (!edited.has("pitch")) setPitchState(remote.pitch);
    if (!edited.has("enabled")) setEnabledState(remote.enabled);
    if (!edited.has("provider") && remote.provider) setProviderState(remote.provider);
    if (!edited.has("groqVoiceId") && remote.groqVoiceId !== undefined) setGroqVoiceIdState(remote.groqVoiceId);
  }, [remote?.loaded, remote?.voiceURI, remote?.rate, remote?.pitch, remote?.enabled, remote?.provider, remote?.groqVoiceId]);

  const setEnabled = (v: boolean | ((prev: boolean) => boolean)) => {
    editedFieldsRef.current.add("enabled");
    setEnabledState((prev) => {
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(prev) : v;
      onChange?.({ tts_enabled: next });
      return next;
    });
  };
  const setVoiceURI = (v: string | null) => { editedFieldsRef.current.add("voiceURI"); setVoiceURIState(v); onChange?.({ tts_voice_uri: v }); };
  const setRate = (v: number) => { editedFieldsRef.current.add("rate"); setRateState(v); onChange?.({ tts_rate: v }); };
  const setPitch = (v: number) => { editedFieldsRef.current.add("pitch"); setPitchState(v); onChange?.({ tts_pitch: v }); };
  const setProvider = (v: TtsProvider) => { editedFieldsRef.current.add("provider"); setProviderState(v); onChange?.({ tts_provider: v }); };
  const setGroqVoiceId = (v: string | null) => { editedFieldsRef.current.add("groqVoiceId"); setGroqVoiceIdState(v); onChange?.({ tts_groq_voice_id: v }); };

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const unlockedRef = useRef(false);
  const keepAliveRef = useRef<number | null>(null);
  // Synchronously updated alongside setIsSpeaking — avoids the React render-lag
  // race where callers read isSpeaking from a ref updated only on render.
  const isSpeakingRef = useRef(false);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const setIsSpeaking = useCallback((v: boolean) => {
    isSpeakingRef.current = v;
    setIsSpeakingState(v);
  }, []);

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    try {
      if (isSupported) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        u.rate = 1;
        window.speechSynthesis.speak(u);
      }
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.setAttribute("playsinline", "true");
        (audioRef.current as any).playsInline = true;
        audioRef.current.crossOrigin = "anonymous";
      }
      const SILENT_WAV =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      audioRef.current.src = SILENT_WAV;
      const p = audioRef.current.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* ignore */ });
      unlockedRef.current = true;
    } catch { /* ignore */ }
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    keepAliveRef.current = window.setInterval(() => {
      try {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      } catch { /* ignore */ }
    }, 10000) as unknown as number;
    return () => {
      if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    };
  }, [isSupported]);

  useEffect(() => { localStorage.setItem("normy_tts_enabled", String(enabled)); }, [enabled]);
  useEffect(() => { if (voiceURI) localStorage.setItem(VOICE_KEY, voiceURI); }, [voiceURI]);
  useEffect(() => { localStorage.setItem(RATE_KEY, String(rate)); }, [rate]);
  useEffect(() => { localStorage.setItem(PITCH_KEY, String(pitch)); }, [pitch]);

  useEffect(() => {
    if (!isSupported) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) setVoices(list);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  const cleanText = (text: string) => text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*•]\s/gm, "")
    .replace(/⚠️/g, "Warning:")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();

  const stop = useCallback(() => {
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    if (isSupported) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      try { audioRef.current.pause(); } catch { /* ignore */ }
      try { audioRef.current.removeAttribute("src"); audioRef.current.load(); } catch { /* ignore */ }
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, [isSupported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    if (!voices.length) return undefined;
    if (voiceURI) {
      const match = voices.find((v) => v.voiceURI === voiceURI);
      if (match) return match;
    }
    return (
      voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google")) ||
      voices.find((v) => v.lang.startsWith("en") && !v.localService) ||
      voices.find((v) => v.lang.startsWith("en"))
    );
  }, [voices, voiceURI]);

  const speakBrowser = useCallback((text: string, onComplete?: () => void) => {
    if (!isSupported) { onComplete?.(); return; }
    window.speechSynthesis.cancel();
    markStage("tts_start");
    setIsSpeaking(true);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "AI Assistant", artist: "Normy" });
      navigator.mediaSession.playbackState = "playing";
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    const preferred = pickVoice();
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
      setIsSpeaking(false);
      onComplete?.();
    };
    utterance.onerror = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
      setIsSpeaking(false);
      onComplete?.();
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    markStage("audio_play_start");
  }, [isSupported, rate, pitch, pickVoice]);

  const speakGroq = useCallback(async (text: string, onComplete?: () => void) => {
    // Guard: onComplete called exactly once across all exit paths (normal, abort, error, mediaSession)
    let completed = false;
    const safeComplete = () => { if (!completed) { completed = true; onComplete?.(); } };

    try {
      markStage("tts_start");
      setIsSpeaking(true);
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const abort = new AbortController();
      fetchAbortRef.current = abort;

      // Race getSession against a timeout — after a background suspend the auth
      // client can deadlock on its internal lock and this await would hang
      // forever, killing TTS silently. A null session falls back to the anon key.
      const session = await Promise.race([
        supabase.auth.getSession().then(({ data }) => data.session),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const headers = {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
      };
      const url = `${supabaseUrl}/functions/v1/groq-tts`;

      // Fetch one sentence chunk — returns null if aborted
      const fetchChunk = async (chunk: string): Promise<Blob | null> => {
        if (abort.signal.aborted) return null;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ text: chunk, voice: groqVoiceId, speed: rate }),
          signal: abort.signal,
        });
        if (abort.signal.aborted) return null;
        if (res.status === 429) throw new Error("RATE_LIMITED");
        if (!res.ok) throw new Error(`Groq TTS failed (${res.status}): ${await res.text()}`);
        return res.blob();
      };

      // Ensure audio element exists
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.setAttribute("playsinline", "true");
        (audioRef.current as any).playsInline = true;
        audioRef.current.crossOrigin = "anonymous";
      }

      // True when el.play() rejected (autoplay policy, missing gesture unlock).
      // Without tracking this the reply ends "successfully" with zero audio.
      let playbackBlocked = false;

      // Play a blob and wait for it to finish.
      // Resolves on natural end, error, OR abort signal — prevents promise from
      // hanging forever when stop() clears el.onended or a mediaSession action fires.
      const playBlob = (blob: Blob): Promise<void> => new Promise((resolve) => {
        if (abort.signal.aborted) { resolve(); return; }
        const blobUrl = URL.createObjectURL(blob);
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = blobUrl;
        const el = audioRef.current!;
        el.setAttribute("playsinline", "true");
        (el as any).playsInline = true;
        el.src = blobUrl;
        el.onended = () => { resolve(); };
        el.onerror = () => { console.error("[Groq TTS] playback error"); resolve(); };
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
        el.play().then(() => {
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        }).catch(() => { playbackBlocked = true; resolve(); });
      });

      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "AI Assistant", artist: "Normy" });
        // Both pause and stop abort cleanly and release any pending onComplete so
        // ttsStreamBusyRef doesn't get stuck true after an OS media interruption.
        const handleInterrupt = () => {
          abort.abort();
          setIsSpeaking(false);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
          safeComplete();
        };
        navigator.mediaSession.setActionHandler("pause", handleInterrupt);
        navigator.mediaSession.setActionHandler("play", () => { audioRef.current?.play().catch(() => {}); });
        navigator.mediaSession.setActionHandler("stop", handleInterrupt);
      }

      const chunks = splitSentences(text);
      const blobPromises = chunks.map(fetchChunk);

      let firstBlob = true;
      for (const blobPromise of blobPromises) {
        if (abort.signal.aborted || playbackBlocked) break;
        const blob = await blobPromise;
        if (!blob || abort.signal.aborted) break;
        if (firstBlob) { markStage("audio_play_start"); firstBlob = false; }
        await playBlob(blob);
      }

      // Autoplay blocked — every chunk would fail the same way; the reply made
      // no sound at all. Try the browser engine instead of ending silently.
      if (playbackBlocked && !abort.signal.aborted) {
        console.warn("[Groq TTS] audio playback blocked — falling back to browser voice");
        setIsSpeaking(false);
        speakBrowser(text, safeComplete);
        return;
      }

      if (!abort.signal.aborted) {
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
        setIsSpeaking(false);
        safeComplete();
      }
    } catch (e: any) {
      if (e?.name === "AbortError") { setIsSpeaking(false); safeComplete(); return; }
      console.error("[Groq TTS] failed, falling back to browser:", e);
      setIsSpeaking(false);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        msg === "RATE_LIMITED"
          ? "Too many requests — slow down a bit and try again."
          : msg.includes("GROQ_API_KEY not configured")
          ? "Premium voice not configured — API key missing. Using browser voice instead."
          : "Premium voice unavailable — using browser voice instead.",
        { duration: 5000 }
      );
      speakBrowser(text, safeComplete);
    }
  }, [groqVoiceId, rate, speakBrowser]);

  const speak = useCallback((text: string, onComplete?: () => void) => {
    if (!enabled) { onComplete?.(); return; }
    const clean = cleanText(text);
    if (!clean) { onComplete?.(); return; }
    stop();
    if (provider === "groq") {
      speakGroq(clean, onComplete);
    } else {
      speakBrowser(clean, onComplete);
    }
  }, [enabled, provider, speakBrowser, speakGroq, stop]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        window.speechSynthesis?.cancel();
        if (audioRef.current) { try { audioRef.current.pause(); } catch { /* ignore */ } }
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  const previewVoice = useCallback(() => {
    const previewText = "Hi, I'm Normy. This is how I'll sound when we talk.";
    stop();
    if (provider === "groq") {
      speakGroq(previewText);
    } else if (isSupported) {
      const u = new SpeechSynthesisUtterance(previewText);
      u.rate = rate;
      u.pitch = pitch;
      const preferred = pickVoice();
      if (preferred) u.voice = preferred;
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(u);
    }
  }, [provider, isSupported, rate, pitch, pickVoice, speakGroq, stop]);

  return {
    enabled,
    isSpeaking,
    isSpeakingRef,
    isSupported,
    speak,
    stop,
    toggle,
    unlockAudio,
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    pitch,
    setPitch,
    previewVoice,
    provider,
    setProvider,
    groqVoiceId,
    setGroqVoiceId,
  };
}
