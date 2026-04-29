import { useEffect, useRef, useState, useCallback } from "react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useTextToSpeech } from "./useTextToSpeech";
import { usePwaEnvironment } from "./usePwaEnvironment";
import { useVoicePreferences } from "./useVoicePreferences";
import { toast } from "sonner";

interface UseVoiceConversationOpts {
  onUserUtterance: (text: string) => void;
  agentReply?: string | null;
  thinking?: boolean;
}

/**
 * Orchestrates a hands-free conversation loop with barge-in:
 * - Listens for user speech
 * - On final transcript, calls onUserUtterance
 * - When agentReply changes, speaks it via TTS
 * - After TTS ends, restarts listening
 * - If user starts speaking while TTS is playing, cancels TTS (barge-in)
 */
export function useVoiceConversation({ onUserUtterance, agentReply, thinking }: UseVoiceConversationOpts) {
  const voicePrefs = useVoicePreferences();
  const [conversationActive, setConversationActive] = useState(false);
  const conversationActiveRef = useRef(false);
  const lastSpokenReplyRef = useRef<string | null>(null);
  const ensuredTtsAfterPrefsRef = useRef(false);
  const thinkingRef = useRef(!!thinking);
  useEffect(() => { thinkingRef.current = !!thinking; }, [thinking]);
  // Forward declare so onEnd can reference it
  const speechRef = useRef<ReturnType<typeof useSpeechRecognition> | null>(null);

  const tts = useTextToSpeech({
    remote: {
      voiceURI: voicePrefs.prefs.tts_voice_uri,
      rate: voicePrefs.prefs.tts_rate,
      pitch: voicePrefs.prefs.tts_pitch,
      enabled: voicePrefs.prefs.tts_enabled,
      loaded: voicePrefs.loaded,
      provider: voicePrefs.prefs.tts_provider,
      elevenlabsVoiceId: voicePrefs.prefs.tts_elevenlabs_voice_id,
      elevenlabsModelId: voicePrefs.prefs.tts_elevenlabs_model_id,
      stability: voicePrefs.prefs.tts_stability,
      similarity: voicePrefs.prefs.tts_similarity,
    },
    onChange: voicePrefs.update,
  });
  const ttsSpeakingRef = useRef(false);
  ttsSpeakingRef.current = tts.isSpeaking;

  // Track consecutive error count for exponential backoff
  const errorCountRef = useRef(0);
  const lastErrorAtRef = useRef(0);
  const pausedByVisibilityRef = useRef(false);

  // Buffer final transcripts so a brief pause (thinking) doesn't cut the user off.
  // We accumulate fragments and only submit after PAUSE_MS of true silence.
  const PAUSE_MS = 2500;
  const pendingTranscriptRef = useRef<string>("");
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onUserUtteranceRef = useRef(onUserUtterance);
  useEffect(() => { onUserUtteranceRef.current = onUserUtterance; }, [onUserUtterance]);

  const flushPending = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    const buffered = pendingTranscriptRef.current.trim();
    pendingTranscriptRef.current = "";
    if (!buffered) return;
    errorCountRef.current = 0;
    if (ttsSpeakingRef.current) {
      try { ttsRef.current?.stop(); } catch { /* ignore */ }
    }
    onUserUtteranceRef.current?.(buffered);
  };

  const speech = useSpeechRecognition({
    continuous: false,
    lang: voicePrefs.prefs.stt_language || "en-US",
    onResult: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      pendingTranscriptRef.current = (
        pendingTranscriptRef.current ? pendingTranscriptRef.current + " " : ""
      ) + trimmed;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        pauseTimerRef.current = null;
        flushPending();
      }, PAUSE_MS);
    },
    onError: (err) => {
      errorCountRef.current += 1;
      lastErrorAtRef.current = Date.now();
      // Critical errors: stop the loop and tell the user
      if (err === "not-allowed" || err === "service-not-allowed") {
        toast.error("Microphone access denied. Enable mic permission in your browser settings to use voice.");
        setConversationActive(false);
        conversationActiveRef.current = false;
        return;
      }
      if (err === "audio-capture") {
        toast.error("No microphone detected. Check your audio device and try again.");
        setConversationActive(false);
        conversationActiveRef.current = false;
        return;
      }
      if (err === "network") {
        // Transient — let the watchdog retry with backoff
        if (errorCountRef.current === 3) {
          toast.warning("Voice recognition is having trouble connecting. Retrying…");
        }
      }
      // After many consecutive errors, stop trying so we don't burn CPU
      if (errorCountRef.current >= 8) {
        toast.error("Voice recognition keeps failing. Pausing — tap the mic to retry.");
        setConversationActive(false);
        conversationActiveRef.current = false;
      }
    },
    onEnd: () => {
      // If conversation is active and we're idle, restart listening shortly.
      // Use refs (not closure) so we read the *current* thinking/speaking state.
      if (!conversationActiveRef.current) return;
      // Backoff if we're in an error storm: 250ms base, doubling up to 4s.
      const backoff = Math.min(250 * Math.pow(2, errorCountRef.current), 4000);
      setTimeout(() => {
        if (
          conversationActiveRef.current &&
          !ttsSpeakingRef.current &&
          !thinkingRef.current &&
          !pausedByVisibilityRef.current
        ) {
          try { speechRef.current?.startListening(); } catch { /* ignore */ }
        }
      }, backoff);
    },
  });

  // Keep ref in sync
  useEffect(() => {
    conversationActiveRef.current = conversationActive;
  }, [conversationActive]);

  useEffect(() => {
    if (!conversationActive || !voicePrefs.loaded || ensuredTtsAfterPrefsRef.current) return;
    const id = window.setTimeout(() => {
      if (!conversationActiveRef.current || ensuredTtsAfterPrefsRef.current) return;
      ensuredTtsAfterPrefsRef.current = true;
      const currentTts = ttsRef.current;
      if (!currentTts.enabled) currentTts.toggle();
    }, 0);
    return () => window.clearTimeout(id);
  }, [conversationActive, voicePrefs.loaded]);

  // Stable refs to avoid re-running the speak effect on every render
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  speechRef.current = speech;

  // When a new agent reply comes in, speak it (if conversation active and TTS enabled)
  useEffect(() => {
    if (!agentReply || agentReply === lastSpokenReplyRef.current) return;
    if (!conversationActive) return;
    lastSpokenReplyRef.current = agentReply;

    // Stop listening while we speak (mic stays available for barge-in via re-start after)
    speechRef.current?.stopListening();

    const t = ttsRef.current;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      if (watchdogId) { clearTimeout(watchdogId); watchdogId = null; }
      if (conversationActiveRef.current) {
        setTimeout(() => { try { speechRef.current?.startListening(); } catch { /* ignore */ } }, 200);
      }
    };
    if (t.enabled && t.isSupported) {
      t.speak(agentReply, resume);
      // Watchdog: if TTS never fires onend (e.g. iOS PWA glitch), force-resume
      // after a generous timeout based on text length (~120 chars/sec read aloud
      // at slowest, plus 8s buffer; cap at 60s).
      const estMs = Math.min(60000, 8000 + agentReply.length * 80);
      watchdogId = setTimeout(() => {
        if (!resumed) {
          console.warn("[voice] TTS watchdog fired — forcing stop & resume");
          try { t.stop(); } catch { /* ignore */ }
          resume();
        }
      }, estMs);
    } else {
      resume();
    }
  }, [agentReply, conversationActive]);

  // Tab visibility: pause listening when hidden, resume when visible.
  // Browsers throttle/kill SpeechRecognition on hidden tabs which causes
  // "stuck" states when the user comes back.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        if (conversationActiveRef.current) {
          pausedByVisibilityRef.current = true;
          try { speechRef.current?.stopListening(); } catch { /* ignore */ }
          try { ttsRef.current?.stop(); } catch { /* ignore */ }
        }
      } else if (pausedByVisibilityRef.current) {
        pausedByVisibilityRef.current = false;
        // Reset error count after a visibility-driven pause; the previous
        // failures are stale.
        errorCountRef.current = 0;
        if (conversationActiveRef.current) {
          setTimeout(() => {
            try { speechRef.current?.startListening(); } catch { /* ignore */ }
          }, 300);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Watchdog: if conversation is active but nothing is happening (not listening,
  // not speaking, not thinking), kick off listening again. Re-runs on an interval
  // so a silently-failed start() will be retried until it sticks. Prevents the
  // "stuck on Paused" state.
  useEffect(() => {
    if (!conversationActive) return;
    if (speech.isListening || tts.isSpeaking || thinking) return;
    const id = setInterval(() => {
      if (
        conversationActiveRef.current &&
        !ttsSpeakingRef.current &&
        !thinkingRef.current &&
        !pausedByVisibilityRef.current &&
        !speechRef.current?.isListening
      ) {
        try { speechRef.current?.startListening(); } catch { /* ignore */ }
      }
    }, 800);
    return () => clearInterval(id);
  }, [conversationActive, speech.isListening, tts.isSpeaking, thinking]);

  const pwa = usePwaEnvironment();

  const startConversation = useCallback(() => {
    ensuredTtsAfterPrefsRef.current = false;
    setConversationActive(true);
    conversationActiveRef.current = true;
    errorCountRef.current = 0;
    pausedByVisibilityRef.current = false;
    voicePrefs.update({ voice_conversation_enabled: true });
    // Unlock iOS SpeechSynthesis on the user gesture (required for PWA).
    // This MUST happen even when SpeechRecognition is unavailable (iOS PWA),
    // so that Normy can still speak replies aloud in TTS-only mode.
    tts.unlockAudio();
    // Auto-enable TTS for conversation mode
    if (!tts.enabled) tts.toggle();
    // Only attempt to start the mic if SpeechRecognition is actually supported.
    // On iOS PWA this API is missing entirely, and calling it throws / no-ops,
    // leaving the user stuck with nothing happening.
    if (speech.isSupported) {
      try { speech.startListening(); } catch { /* ignore */ }
    }
  }, [speech, tts, voicePrefs]);

  const stopConversation = useCallback(() => {
    setConversationActive(false);
    conversationActiveRef.current = false;
    ensuredTtsAfterPrefsRef.current = false;
    voicePrefs.update({ voice_conversation_enabled: false });
    speech.stopListening();
    tts.stop();
  }, [speech, tts, voicePrefs]);

  const toggleConversation = useCallback(() => {
    if (conversationActive) stopConversation();
    else startConversation();
  }, [conversationActive, startConversation, stopConversation]);

  return {
    conversationActive,
    isListening: speech.isListening,
    isSpeaking: tts.isSpeaking,
    isSupported: speech.isSupported,
    transcript: speech.transcript,
    prefsLoaded: voicePrefs.loaded,
    ttsEnabled: tts.enabled,
    toggleTts: tts.toggle,
    startConversation,
    stopConversation,
    toggleConversation,
    // Voice settings
    voices: tts.voices,
    voiceURI: tts.voiceURI,
    setVoiceURI: tts.setVoiceURI,
    rate: tts.rate,
    setRate: tts.setRate,
    pitch: tts.pitch,
    setPitch: tts.setPitch,
    previewVoice: tts.previewVoice,
    ttsSupported: tts.isSupported,
    // Premium TTS
    provider: tts.provider,
    setProvider: tts.setProvider,
    elevenlabsVoiceId: tts.elevenlabsVoiceId,
    setElevenlabsVoiceId: tts.setElevenlabsVoiceId,
    elevenlabsModelId: tts.elevenlabsModelId,
    setElevenlabsModelId: tts.setElevenlabsModelId,
    stability: tts.stability,
    setStability: tts.setStability,
    similarity: tts.similarity,
    setSimilarity: tts.setSimilarity,
    // STT language preference
    sttLanguage: voicePrefs.prefs.stt_language,
    setSttLanguage: (lang: string) => voicePrefs.update({ stt_language: lang }),
    // PWA environment flags
    isStandalone: pwa.isStandalone,
    isIOS: pwa.isIOS,
    speechRecognitionBlockedByPwa: pwa.speechRecognitionBlockedByPwa,
  };
}
