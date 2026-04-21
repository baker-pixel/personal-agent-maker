import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const VOICE_KEY = "normy_tts_voice";
const RATE_KEY = "normy_tts_rate";
const PITCH_KEY = "normy_tts_pitch";

export type TtsProvider = "browser" | "elevenlabs";

interface TtsRemoteOpts {
  remote?: {
    voiceURI: string | null;
    rate: number;
    pitch: number;
    enabled: boolean;
    loaded: boolean;
    // Premium
    provider?: TtsProvider;
    elevenlabsVoiceId?: string | null;
    elevenlabsModelId?: string;
    stability?: number;
    similarity?: number;
  };
  onChange?: (patch: {
    tts_voice_uri?: string | null;
    tts_rate?: number;
    tts_pitch?: number;
    tts_enabled?: boolean;
    tts_provider?: TtsProvider;
    tts_elevenlabs_voice_id?: string | null;
    tts_elevenlabs_model_id?: string;
    tts_stability?: number;
    tts_similarity?: number;
  }) => void;
}

export function useTextToSpeech(opts: TtsRemoteOpts = {}) {
  const { remote, onChange } = opts;
  const [enabled, setEnabledState] = useState(() => {
    return localStorage.getItem("normy_tts_enabled") === "true";
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
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
  // Premium state (purely remote-driven; no localStorage fallback)
  const [provider, setProviderState] = useState<TtsProvider>("browser");
  const [elevenlabsVoiceId, setElevenlabsVoiceIdState] = useState<string | null>("EXAVITQu4vr4xnSDxMaL");
  const [elevenlabsModelId, setElevenlabsModelIdState] = useState<string>("eleven_multilingual_v2");
  const [stability, setStabilityState] = useState<number>(0.5);
  const [similarity, setSimilarityState] = useState<number>(0.75);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!remote?.loaded || hydratedRef.current) return;
    hydratedRef.current = true;
    setVoiceURIState(remote.voiceURI);
    setRateState(remote.rate);
    setPitchState(remote.pitch);
    setEnabledState(remote.enabled);
    if (remote.provider) setProviderState(remote.provider);
    if (remote.elevenlabsVoiceId !== undefined) setElevenlabsVoiceIdState(remote.elevenlabsVoiceId);
    if (remote.elevenlabsModelId) setElevenlabsModelIdState(remote.elevenlabsModelId);
    if (remote.stability != null) setStabilityState(remote.stability);
    if (remote.similarity != null) setSimilarityState(remote.similarity);
  }, [remote?.loaded, remote?.voiceURI, remote?.rate, remote?.pitch, remote?.enabled, remote?.provider, remote?.elevenlabsVoiceId, remote?.elevenlabsModelId, remote?.stability, remote?.similarity]);

  const setEnabled = (v: boolean | ((prev: boolean) => boolean)) => {
    setEnabledState((prev) => {
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(prev) : v;
      onChange?.({ tts_enabled: next });
      return next;
    });
  };
  const setVoiceURI = (v: string | null) => { setVoiceURIState(v); onChange?.({ tts_voice_uri: v }); };
  const setRate = (v: number) => { setRateState(v); onChange?.({ tts_rate: v }); };
  const setPitch = (v: number) => { setPitchState(v); onChange?.({ tts_pitch: v }); };
  const setProvider = (v: TtsProvider) => { setProviderState(v); onChange?.({ tts_provider: v }); };
  const setElevenlabsVoiceId = (v: string | null) => { setElevenlabsVoiceIdState(v); onChange?.({ tts_elevenlabs_voice_id: v }); };
  const setElevenlabsModelId = (v: string) => { setElevenlabsModelIdState(v); onChange?.({ tts_elevenlabs_model_id: v }); };
  const setStability = (v: number) => { setStabilityState(v); onChange?.({ tts_stability: v }); };
  const setSimilarity = (v: number) => { setSimilarityState(v); onChange?.({ tts_similarity: v }); };

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const unlockedRef = useRef(false);
  const keepAliveRef = useRef<number | null>(null);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // iOS unlock for both Web Speech AND <audio> playback
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    try {
      if (isSupported) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      // Prime an Audio element with a silent buffer (helps iOS PWA)
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
      }
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
    if (isSupported) window.speechSynthesis.cancel();
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current.src = "";
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
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    const preferred = pickVoice();
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); onComplete?.(); };
    utterance.onerror = () => { setIsSpeaking(false); onComplete?.(); };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, rate, pitch, pickVoice]);

  const speakElevenLabs = useCallback(async (text: string, onComplete?: () => void) => {
    try {
      setIsSpeaking(true);
      // Use direct fetch (not supabase.functions.invoke) because the SDK
      // tries to JSON-parse responses, which corrupts binary audio.
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify({
          text,
          voice_id: elevenlabsVoiceId,
          model_id: elevenlabsModelId,
          stability,
          similarity_boost: similarity,
          speed: rate,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Premium TTS failed (${res.status}): ${errText}`);
      }
      const blob = await res.blob();
      console.log("[ElevenLabs TTS] received", blob.size, "bytes,", blob.type);
      const url = URL.createObjectURL(blob);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => { setIsSpeaking(false); onComplete?.(); };
      audioRef.current.onerror = (e) => {
        console.error("[ElevenLabs TTS] audio playback error", e);
        setIsSpeaking(false);
        onComplete?.();
      };
      await audioRef.current.play();
    } catch (e) {
      console.error("[ElevenLabs TTS] failed, falling back to browser:", e);
      setIsSpeaking(false);
      // Fallback to browser TTS so the user still hears something
      speakBrowser(text, onComplete);
    }
  }, [elevenlabsVoiceId, elevenlabsModelId, stability, similarity, rate, speakBrowser]);

  const speak = useCallback((text: string, onComplete?: () => void) => {
    if (!enabled) { onComplete?.(); return; }
    const clean = cleanText(text);
    if (!clean) { onComplete?.(); return; }
    stop();
    if (provider === "elevenlabs") {
      speakElevenLabs(clean, onComplete);
    } else {
      speakBrowser(clean, onComplete);
    }
  }, [enabled, provider, speakBrowser, speakElevenLabs, stop]);

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
    if (provider === "elevenlabs") {
      speakElevenLabs(previewText);
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
  }, [provider, isSupported, rate, pitch, pickVoice, speakElevenLabs, stop]);

  return {
    enabled,
    isSpeaking,
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
    // Premium
    provider,
    setProvider,
    elevenlabsVoiceId,
    setElevenlabsVoiceId,
    elevenlabsModelId,
    setElevenlabsModelId,
    stability,
    setStability,
    similarity,
    setSimilarity,
  };
}
