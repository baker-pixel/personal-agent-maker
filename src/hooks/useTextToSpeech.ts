import { useState, useCallback, useRef, useEffect } from "react";

const VOICE_KEY = "normy_tts_voice";
const RATE_KEY = "normy_tts_rate";
const PITCH_KEY = "normy_tts_pitch";

interface TtsRemoteOpts {
  remote?: {
    voiceURI: string | null;
    rate: number;
    pitch: number;
    enabled: boolean;
    loaded: boolean;
  };
  onChange?: (patch: { tts_voice_uri?: string | null; tts_rate?: number; tts_pitch?: number; tts_enabled?: boolean }) => void;
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

  // Hydrate from remote prefs once they load (remote wins over localStorage)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!remote?.loaded || hydratedRef.current) return;
    hydratedRef.current = true;
    setVoiceURIState(remote.voiceURI);
    setRateState(remote.rate);
    setPitchState(remote.pitch);
    setEnabledState(remote.enabled);
  }, [remote?.loaded, remote?.voiceURI, remote?.rate, remote?.pitch, remote?.enabled]);

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
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const unlockedRef = useRef(false);
  const keepAliveRef = useRef<number | null>(null);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  /**
   * iOS (Safari + standalone PWA) requires SpeechSynthesis to be "unlocked"
   * by a user gesture before it will produce audio. We speak an empty/silent
   * utterance the first time the user interacts with voice.
   */
  const unlockAudio = useCallback(() => {
    if (!isSupported || unlockedRef.current) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.rate = 1;
      window.speechSynthesis.speak(u);
      unlockedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [isSupported]);

  /**
   * iOS pauses the SpeechSynthesis queue after ~15s. A periodic pause/resume
   * "keep-alive" prevents truncation of long utterances.
   */
  useEffect(() => {
    if (!isSupported) return;
    keepAliveRef.current = window.setInterval(() => {
      try {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      } catch {
        /* ignore */
      }
    }, 10000) as unknown as number;
    return () => {
      if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
    };
  }, [isSupported]);

  useEffect(() => {
    localStorage.setItem("normy_tts_enabled", String(enabled));
  }, [enabled]);

  useEffect(() => {
    if (voiceURI) localStorage.setItem(VOICE_KEY, voiceURI);
  }, [voiceURI]);

  useEffect(() => {
    localStorage.setItem(RATE_KEY, String(rate));
  }, [rate]);

  useEffect(() => {
    localStorage.setItem(PITCH_KEY, String(pitch));
  }, [pitch]);

  // Load voices (async in some browsers)
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

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
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

  const speak = useCallback((text: string, onComplete?: () => void) => {
    if (!isSupported || !enabled) {
      onComplete?.();
      return;
    }

    const clean = text
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

    if (!clean) {
      onComplete?.();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = rate;
    utterance.pitch = pitch;

    const preferred = pickVoice();
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); onComplete?.(); };
    utterance.onerror = () => { setIsSpeaking(false); onComplete?.(); };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, enabled, rate, pitch, pickVoice]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  const previewVoice = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Hi, I'm Normy. This is how I'll sound when we talk.");
    u.rate = rate;
    u.pitch = pitch;
    const preferred = pickVoice();
    if (preferred) u.voice = preferred;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [isSupported, rate, pitch, pickVoice]);

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
  };
}
