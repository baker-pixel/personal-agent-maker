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
  // True once the user has sent a message in THIS voice session. Until then
  // the only thing TTS may speak is the greeting — replies that were already
  // in the transcript when the session started (restored history, stale async
  // loads) must never be read aloud.
  const sentThisSessionRef = useRef(false);

  const chat = useAnnieChat(agentName, "voice", {
    conversationTitle: opts.conversationTitle,
    enabled: opts.enabled,
    skipInitialLoad: opts.skipInitialLoad,
  });

  const sendInSession = useCallback((text: string) => {
    sentThisSessionRef.current = true;
    return chat.send(text);
  }, [chat.send]);

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
    // Only the LAST message counts, and only if it's the agent's. While
    // thinking but before the first token, the list ends with the user's new
    // message — scanning backwards past it would return the PREVIOUS reply,
    // and the voice loop would speak the earlier answer as if it streamed now.
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "agent") return null;
    return stripMarkdown(last.text) || null;
  }, [chat.messages, chat.thinking]);

  const onUserUtteranceRef = useRef(opts.onUserUtterance);
  useEffect(() => { onUserUtteranceRef.current = opts.onUserUtterance; });

  // Hard gate: no user turn this session yet → nothing but the greeting is
  // speakable, no matter what the message list contains.
  const speakableReply = sentThisSessionRef.current && !chat.thinking ? latestAgentReply : null;

  const voice = useVoiceConversation({
    onUserUtterance: (text) => onUserUtteranceRef.current?.(text),
    agentReply: pendingGreeting ?? speakableReply,
    streamingText: pendingGreeting || !sentThisSessionRef.current ? null : streamingAgentText,
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
    }
  }, [voice.conversationActive, voice.prefsLoaded, voice.ttsEnabled, greeting, chat.loading, chat.messages.length]);

  // Clear the greeting in its own effect, keyed ONLY on pendingGreeting.
  // When the timer lived in the effect above, any dep changing within 500ms
  // (display name resolving, prefs settling) ran the cleanup, killed the
  // timer, and pendingGreeting stayed set forever — pinning agentReply to the
  // greeting and muting every real reply for the rest of the session.
  useEffect(() => {
    if (!pendingGreeting) return;
    const t = setTimeout(() => setPendingGreeting(null), 500);
    return () => clearTimeout(t);
  }, [pendingGreeting]);

  const resetGreeting = useCallback(() => {
    greetedRef.current = false;
    sentThisSessionRef.current = false;
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

  // Surfaces must send through sendInSession so the per-session "user actually
  // spoke" gate opens — expose it as chat.send so call sites can't bypass it.
  return {
    chat: { ...chat, send: sendInSession },
    voice,
    startSession,
    resetSession,
    resetGreeting,
    handleMicTap,
  };
}
