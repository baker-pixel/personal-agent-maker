import { useEffect, useRef, useState, useCallback } from "react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useTextToSpeech } from "./useTextToSpeech";
import { usePwaEnvironment } from "./usePwaEnvironment";
import { useVoicePreferences } from "./useVoicePreferences";

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

  const speech = useSpeechRecognition({
    continuous: false,
    lang: voicePrefs.prefs.stt_language || "en-US",
    onResult: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Barge-in: stop any ongoing TTS
      if (ttsSpeakingRef.current) tts.stop();
      onUserUtterance(trimmed);
    },
    onEnd: () => {
      // If conversation is active and we're not speaking/thinking, restart listening
      if (conversationActiveRef.current && !ttsSpeakingRef.current && !thinking) {
        setTimeout(() => {
          if (conversationActiveRef.current && !ttsSpeakingRef.current) {
            try { speech.startListening(); } catch { }
          }
        }, 250);
      }
    },
  });

  // Keep ref in sync
  useEffect(() => {
    conversationActiveRef.current = conversationActive;
  }, [conversationActive]);

  // When a new agent reply comes in, speak it (if conversation active and TTS enabled)
  useEffect(() => {
    if (!agentReply || agentReply === lastSpokenReplyRef.current) return;
    if (!conversationActive) return;
    lastSpokenReplyRef.current = agentReply;

    // Stop listening while we speak (mic stays available for barge-in via re-start after)
    speech.stopListening();

    if (tts.enabled && tts.isSupported) {
      tts.speak(agentReply, () => {
        // After speaking, resume listening
        if (conversationActiveRef.current) {
          setTimeout(() => {
            try { speech.startListening(); } catch { }
          }, 200);
        }
      });
    } else {
      // TTS off — just resume listening
      if (conversationActiveRef.current) {
        setTimeout(() => { try { speech.startListening(); } catch { } }, 200);
      }
    }
  }, [agentReply, conversationActive, tts, speech]);

  const pwa = usePwaEnvironment();

  const startConversation = useCallback(() => {
    setConversationActive(true);
    conversationActiveRef.current = true;
    voicePrefs.update({ voice_conversation_enabled: true });
    // Unlock iOS SpeechSynthesis on the user gesture (required for PWA)
    tts.unlockAudio();
    // Auto-enable TTS for conversation mode
    if (!tts.enabled) tts.toggle();
    try { speech.startListening(); } catch { }
  }, [speech, tts, voicePrefs]);

  const stopConversation = useCallback(() => {
    setConversationActive(false);
    conversationActiveRef.current = false;
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
