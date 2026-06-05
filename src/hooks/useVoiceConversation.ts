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
  /** Live streaming text from the LLM while thinking=true. Hook speaks complete sentences immediately. */
  streamingText?: string | null;
}

/** Extract sentences that end with .!? followed by whitespace from text[from..]. */
function extractCompleteSentences(text: string, from: number): { sentences: string[]; newFrom: number } {
  const portion = text.slice(from);
  const sentences: string[] = [];
  let pos = 0;
  let sentenceStart = 0;
  while (pos < portion.length) {
    const ch = portion[pos];
    if ('.!?'.includes(ch) && pos + 1 < portion.length && /\s/.test(portion[pos + 1])) {
      const sentence = portion.slice(sentenceStart, pos + 1).trim();
      if (sentence.length >= 4) sentences.push(sentence);
      pos++;
      while (pos < portion.length && /\s/.test(portion[pos])) pos++;
      sentenceStart = pos;
    } else {
      pos++;
    }
  }
  return { sentences, newFrom: from + sentenceStart };
}

/**
 * Orchestrates a hands-free conversation loop with barge-in:
 * - Listens for user speech
 * - On final transcript, calls onUserUtterance
 * - When agentReply changes, speaks it via TTS
 * - After TTS ends, restarts listening
 * - If user starts speaking while TTS is playing, cancels TTS (barge-in)
 */
export function useVoiceConversation({ onUserUtterance, agentReply, thinking, streamingText }: UseVoiceConversationOpts) {
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
      groqVoiceId: voicePrefs.prefs.tts_groq_voice_id,
    },
    onChange: voicePrefs.update,
  });
  // Use TTS's synchronously-updated ref directly — avoids the React render-lag race
  // where ttsSpeakingRef.current read stale false while TTS had already started.
  const ttsSpeakingRef = tts.isSpeakingRef;

  // Stable ref — must be defined before `speech` so onSilenceTimeout can use it.
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  // Track consecutive error count for exponential backoff
  const errorCountRef = useRef(0);
  const lastErrorAtRef = useRef(0);
  const pausedByVisibilityRef = useRef(false);
  // Tracks the timestamp of our last `startListening()` call so the watchdog
  // doesn't fire a second start before the previous one's `onstart` lands.
  const lastStartAttemptRef = useRef(0);

  // Streaming TTS queue: speak LLM sentences as they arrive, not after full response.
  const streamingSpokenUpToRef = useRef(0);  // chars of streamingText already queued
  const ttsStreamQueueRef = useRef<string[]>([]);
  const ttsStreamBusyRef = useRef(false);
  const postDrainCallbackRef = useRef<(() => void) | null>(null);
  // Real-time VAD signal — updated before React re-renders, used in drainStreamQueue closure.
  const isSpeechActiveRef = useRef(false);

  // Drain the streaming TTS queue one sentence at a time.
  const drainStreamQueue = useCallback(() => {
    if (ttsStreamBusyRef.current) return;
    if (ttsStreamQueueRef.current.length === 0) {
      const cb = postDrainCallbackRef.current;
      if (cb) { postDrainCallbackRef.current = null; cb(); }
      return;
    }
    if (!conversationActiveRef.current) { ttsStreamQueueRef.current = []; return; }
    // Barge-in: user is speaking right now — discard remaining queue
    if (isSpeechActiveRef.current) { ttsStreamQueueRef.current = []; ttsStreamBusyRef.current = false; return; }
    const sentence = ttsStreamQueueRef.current.shift()!;
    ttsStreamBusyRef.current = true;
    const t = ttsRef.current;
    if (t.enabled && t.isSupported) {
      t.speak(sentence, () => { ttsStreamBusyRef.current = false; drainStreamQueue(); });
    } else {
      ttsStreamBusyRef.current = false;
      drainStreamQueue();
    }
  // drainStreamQueue only uses refs — stable, no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buffer final transcripts so a brief pause (thinking) doesn't cut the user off.
  // We accumulate fragments and only submit after PAUSE_MS of true silence.
  const PAUSE_MS = 300;
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
    // Barge-in: discard streaming TTS queue and reset state for next turn
    ttsStreamQueueRef.current = [];
    ttsStreamBusyRef.current = false;
    postDrainCallbackRef.current = null;
    streamingSpokenUpToRef.current = 0;
    // Stop mic immediately — prevents noise during LLM thinking from racing into
    // the next turn. The agentReply effect restarts it after TTS finishes.
    try { speechRef.current?.stopListening(); } catch { /* ignore */ }
    if (ttsSpeakingRef.current) {
      try { ttsRef.current?.stop(); } catch { /* ignore */ }
    }
    onUserUtteranceRef.current?.(buffered);
  };

  // Use continuous mode so mobile Safari doesn't end recognition the moment
  // it doesn't hear speech in the first ~1s. We rely on our PAUSE_MS buffer
  // (in onResult) to decide when the user has finished a turn.
  const speech = useSpeechRecognition({
    continuous: true,
    lang: voicePrefs.prefs.stt_language || "en-US",
    silenceTimeoutMs: 5000,
    onSilenceTimeout: () => {
      if (!conversationActiveRef.current) return;
      // Don't interrupt if agent is already working or TTS is playing.
      if (thinkingRef.current || ttsSpeakingRef.current || pendingTranscriptRef.current) return;
      const msg = "I didn't hear anything — I'm still here whenever you're ready.";
      setConversationActive(false);
      conversationActiveRef.current = false;
      ttsRef.current.speak(msg);
    },
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
          !pausedByVisibilityRef.current &&
          !pendingTranscriptRef.current
        ) {
          lastStartAttemptRef.current = Date.now();
          try { speechRef.current?.startListening(); } catch { /* ignore */ }
        }
      }, backoff);
    },
  });

  // Keep ref in sync
  useEffect(() => {
    conversationActiveRef.current = conversationActive;
  }, [conversationActive]);

  // Real-time barge-in: as soon as VAD signals speech onset (isSpeechActive=true),
  // cancel TTS so the user's voice is captured cleanly.
  isSpeechActiveRef.current = speech.isSpeechActive;
  useEffect(() => {
    if (!speech.isSpeechActive) return;
    if (!conversationActiveRef.current) return;
    if (!ttsSpeakingRef.current && !ttsStreamBusyRef.current && !ttsStreamQueueRef.current.length) return;
    // User started speaking — flush TTS state immediately.
    ttsStreamQueueRef.current = [];
    ttsStreamBusyRef.current = false;
    postDrainCallbackRef.current = null;
    try { ttsRef.current.stop(); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isSpeechActive]);

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

  // Keep stable refs in sync each render.
  ttsRef.current = tts;
  speechRef.current = speech;

  // Streaming TTS: as LLM streams, detect completed sentences and speak them immediately.
  // This slashes perceived latency — user hears sentence 1 while sentence 2 is still generating.
  useEffect(() => {
    if (!streamingText || !conversationActive) return;
    const { sentences, newFrom } = extractCompleteSentences(streamingText, streamingSpokenUpToRef.current);
    if (!sentences.length) return;
    streamingSpokenUpToRef.current = newFrom;
    // Stop listening on first streaming chunk
    if (!ttsSpeakingRef.current && !ttsStreamBusyRef.current) {
      speechRef.current?.stopListening();
    }
    ttsStreamQueueRef.current.push(...sentences);
    drainStreamQueue();
  }, [streamingText, conversationActive, drainStreamQueue]);

  // When the full agent reply arrives (thinking=false), speak only the unspoken tail,
  // then resume listening. Coordinates with the streaming queue via postDrainCallbackRef.
  useEffect(() => {
    if (!agentReply || agentReply === lastSpokenReplyRef.current) return;
    if (!conversationActive) return;
    lastSpokenReplyRef.current = agentReply;

    // How much was already queued via streaming TTS
    const alreadyQueued = streamingSpokenUpToRef.current;
    const remainder = alreadyQueued > 0 ? agentReply.slice(alreadyQueued).trim() : agentReply;
    streamingSpokenUpToRef.current = 0; // reset for next turn

    const t = ttsRef.current;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      if (watchdogId) { clearTimeout(watchdogId); watchdogId = null; }
      if (conversationActiveRef.current) {
        setTimeout(() => {
          lastStartAttemptRef.current = Date.now();
          try { speechRef.current?.startListening(); } catch { /* ignore */ }
        }, 500);
      }
    };

    const speakRemainder = () => {
      if (!remainder) { resume(); return; }
      speechRef.current?.stopListening();
      if (t.enabled && t.isSupported) {
        t.speak(remainder, resume);
        const estMs = Math.min(60000, 8000 + remainder.length * 80);
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
    };

    // Wait for streaming queue to drain before speaking remainder
    if (ttsStreamBusyRef.current || ttsStreamQueueRef.current.length > 0) {
      postDrainCallbackRef.current = speakRemainder;
    } else {
      speakRemainder();
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
            lastStartAttemptRef.current = Date.now();
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
  // so a silently-failed start() will be retried until it sticks.
  // CRITICAL on mobile Safari: only fire when we've been idle for a real moment
  // (>=2.5s since last start attempt) AND there is no buffered transcript the
  // user is actively dictating. Otherwise the watchdog races with `onstart`
  // and aborts the user mid-sentence ("stops before I can speak").
  // (lastStartAttemptRef is declared near the top of the hook)
  useEffect(() => {
    if (!conversationActive) return;
    if (speech.isListening || tts.isSpeaking || thinking) return;
    const id = setInterval(() => {
      if (
        conversationActiveRef.current &&
        !ttsSpeakingRef.current &&
        !thinkingRef.current &&
        !pausedByVisibilityRef.current &&
        !speechRef.current?.isListening &&
        !pendingTranscriptRef.current && // don't restart while user is dictating
        Date.now() - lastStartAttemptRef.current > 2500 // back off after a recent attempt
      ) {
        lastStartAttemptRef.current = Date.now();
        try { speechRef.current?.startListening(); } catch { /* ignore */ }
      }
    }, 1200);
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
    // Unlock iOS SpeechSynthesis + <audio> on the user gesture (required for PWA).
    // MUST happen synchronously inside the gesture handler — never after `await`.
    tts.unlockAudio();
    // Auto-enable TTS for conversation mode
    if (!tts.enabled) tts.toggle();
    // Only attempt to start the mic if SpeechRecognition is actually supported.
    // On iOS PWA this API is missing entirely; TTS-only mode is the fallback.
    if (speech.isSupported) {
      // Fire getUserMedia synchronously from the gesture handler to pre-warm mic
      // permission state (iOS Safari won't show the SpeechRecognition prompt until
      // getUserMedia has been called at least once from a gesture context).
      // Fire-and-forget — we don't gate startListening on it because SpeechRecognition
      // ALSO needs to be called from this same gesture context on iOS.
      try {
        navigator.mediaDevices?.getUserMedia({ audio: true })
          .then((stream) => { stream.getTracks().forEach((t) => t.stop()); })
          .catch(() => { /* user denied; SpeechRecognition will surface error */ });
      } catch { /* ignore — mediaDevices missing on old browsers */ }
      // Start recognition synchronously while still in the gesture handler.
      // Skip if TTS is already playing (greeting may have started) — resume() handles restart.
      if (!ttsSpeakingRef.current) {
        lastStartAttemptRef.current = Date.now();
        try { speech.startListening(); } catch { /* ignore */ }
      }
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
    groqVoiceId: tts.groqVoiceId,
    setGroqVoiceId: tts.setGroqVoiceId,
    // STT language preference
    sttLanguage: voicePrefs.prefs.stt_language,
    setSttLanguage: (lang: string) => voicePrefs.update({ stt_language: lang }),
    // PWA environment flags
    isStandalone: pwa.isStandalone,
    isIOS: pwa.isIOS,
    speechRecognitionBlockedByPwa: pwa.speechRecognitionBlockedByPwa,
  };
}
