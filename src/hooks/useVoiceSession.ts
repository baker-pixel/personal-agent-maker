import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useAnnieChat } from "./useAnnieChat";
import { useVoiceConversation } from "./useVoiceConversation";
import { useUserDisplayName } from "./useUserDisplayName";
import { stripMarkdown } from "@/lib/stripMarkdown";

interface UseVoiceSessionOpts {
  /** Conversation title in Delegate history (e.g. "Quick Chat"). */
  conversationTitle?: string;
  /** Defer the chat hook's DB queries until true (lazy surfaces). */
  enabled?: boolean;
  /** Don't auto-load the most recent conversation on mount. */
  skipInitialLoad?: boolean;
  /** Called with the final transcript of each user speaking turn. */
  onUserUtterance?: (text: string) => void;
}

/**
 * Single source of truth for every "talk to the agent" surface (DecisionVoice
 * page, ModeSelect quick chat). Owns the chat hook, the voice loop, the spoken
 * greeting, and the mic-button behavior so all entry points act identically.
 */
export function useVoiceSession(agentName: string, opts: UseVoiceSessionOpts = {}) {
  const userName = useUserDisplayName();
  const [pendingGreeting, setPendingGreeting] = useState<string | null>(null);
  const greetedRef = useRef(false);

  const chat = useAnnieChat(agentName, "voice", {
    conversationTitle: opts.conversationTitle,
    enabled: opts.enabled,
    skipInitialLoad: opts.skipInitialLoad,
  });

  // The voice hook slices the final reply by character offsets counted against
  // streamingText, so both MUST go through the same transform.
  const latestAgentReply = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "agent") {
        return stripMarkdown(chat.messages[i].text);
      }
    }
    return null;
  }, [chat.messages]);

  const streamingAgentText = useMemo(() => {
    if (!chat.thinking) return null;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "agent") {
        return stripMarkdown(chat.messages[i].text) || null;
      }
    }
    return null;
  }, [chat.messages, chat.thinking]);

  const onUserUtteranceRef = useRef(opts.onUserUtterance);
  useEffect(() => { onUserUtteranceRef.current = opts.onUserUtterance; });

  const voice = useVoiceConversation({
    onUserUtterance: (text) => onUserUtteranceRef.current?.(text),
    agentReply: pendingGreeting ?? (chat.thinking ? null : latestAgentReply),
    streamingText: pendingGreeting ? null : streamingAgentText,
    thinking: chat.thinking,
    pushToTalk: true,
  });

  const greeting = userName
    ? `Hey ${userName}, how can I help?`
    : "Hey there, how can I help?";

  // Speak the greeting once per session. Gates:
  // - prefsLoaded: greeting uses the user's saved voice, not the default
  // - ttsEnabled: speak() no-ops silently when disabled, which would burn the
  //   one-shot greetedRef and leave the session mute
  // - !chat.loading + empty messages: only greet a genuinely fresh conversation
  useEffect(() => {
    if (
      voice.conversationActive &&
      voice.prefsLoaded &&
      voice.ttsEnabled &&
      !greetedRef.current &&
      !chat.loading &&
      chat.messages.length === 0
    ) {
      greetedRef.current = true;
      setPendingGreeting(greeting);
      const t = setTimeout(() => setPendingGreeting(null), 500);
      return () => clearTimeout(t);
    }
  }, [voice.conversationActive, voice.prefsLoaded, voice.ttsEnabled, greeting, chat.loading, chat.messages.length]);

  const resetGreeting = useCallback(() => {
    greetedRef.current = false;
    setPendingGreeting(null);
  }, []);

  /** Start a fresh voice session: clear chat, re-arm the greeting, start the loop. */
  const startSession = useCallback(() => {
    chat.reset();
    resetGreeting();
    voice.startConversation();
  }, [chat.reset, resetGreeting, voice.startConversation]);

  /** Stop the voice loop AND clear the transcript (New chat / close overlay). */
  const resetSession = useCallback(() => {
    voice.stopConversation();
    chat.reset();
    resetGreeting();
  }, [voice.stopConversation, chat.reset, resetGreeting]);

  /** Unified mic-button behavior — every surface routes its mic tap here. */
  const handleMicTap = useCallback(() => {
    if (!voice.isSupported && !voice.speechRecognitionBlockedByPwa) return;

    // iOS PWA: SpeechRecognition unavailable — mic button toggles TTS-only mode
    if (voice.speechRecognitionBlockedByPwa) {
      if (!voice.conversationActive) {
        chat.reset();
        resetGreeting();
      }
      voice.toggleConversation();
      return;
    }

    if (!voice.conversationActive) {
      startSession();
      return;
    }

    // PTT: toggle recording turn. Tapping while a transcription is in flight
    // cancels it and starts a fresh recording — the button is never a dead end.
    if (voice.isListening) voice.stopRecordingTurn();
    else voice.startRecordingTurn();
  }, [
    voice.isSupported,
    voice.speechRecognitionBlockedByPwa,
    voice.conversationActive,
    voice.isListening,
    voice.toggleConversation,
    voice.startRecordingTurn,
    voice.stopRecordingTurn,
    chat.reset,
    resetGreeting,
    startSession,
  ]);

  return { chat, voice, startSession, resetSession, resetGreeting, handleMicTap };
}
