// @ts-nocheck
import { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, PhoneOff, Send, Loader2 } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { useVoiceActions, CONFIRM_REGEX } from "@/hooks/useVoiceActions";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";
import { stripMarkdown } from "@/lib/stripMarkdown";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";
import { CalendarJsonParser } from "@/components/chat/CalendarJsonParser";
import { ContactJsonParser } from "@/components/chat/ContactJsonParser";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

export default function ModeSelect() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const displayName = agentName || "Normy Agent";

  // Fix #2: use saved display name preference, falls back to auth metadata
  const userName = useUserDisplayName();

  const [voiceOpen, setVoiceOpen] = useState(false);
  // Fix #4: only enable chat hook (and its DB queries) on first mic tap
  const [hookEnabled, setHookEnabled] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [pendingGreeting, setPendingGreeting] = useState<string | null>(null);
  const greetedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fix #5: separate conversation title so quick sessions don't pollute Delegate history
  const chat = useAnnieChat(displayName, "voice", {
    conversationTitle: "Quick Chat",
    enabled: hookEnabled,
  });

  // Fix #1: strip markdown before TTS so "**bold**" isn't spoken literally
  const latestAgentReply = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "agent") {
        return stripMarkdown(chat.messages[i].text);
      }
    }
    return null;
  }, [chat.messages]);

  // Fix #2: greeting uses saved display name preference
  const greeting = userName ? `Hey ${userName}, how can I help?` : "Hey, how can I help?";

  // Fix #3: extracted shared hook — no more duplicated action logic
  const { pendingVoiceAction, executeVoiceAction, resetActions } = useVoiceActions({
    messages: chat.messages,
    injectAgentMessage: chat.injectAgentMessage,
  });

  const voice = useVoiceConversation({
    onUserUtterance: (text) => {
      if (CONFIRM_REGEX.test(text) && pendingVoiceAction) {
        executeVoiceAction(pendingVoiceAction);
        return;
      }
      chat.send(text);
    },
    agentReply: pendingGreeting ?? (chat.thinking ? null : latestAgentReply),
    thinking: chat.thinking,
  });

  useEffect(() => {
    if (voice.conversationActive && voice.prefsLoaded && !greetedRef.current && chat.messages.length === 0) {
      greetedRef.current = true;
      setPendingGreeting(greeting);
      const t = setTimeout(() => setPendingGreeting(null), 500);
      return () => clearTimeout(t);
    }
  }, [voice.conversationActive, voice.prefsLoaded, greeting, chat.messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const handleMicTap = () => {
    if (!hookEnabled) setHookEnabled(true); // lazily enable DB queries on first tap
    greetedRef.current = false;
    setVoiceOpen(true);
    if (!voice.conversationActive) voice.toggleConversation();
  };

  const handleClose = () => {
    voice.stopConversation();
    setVoiceOpen(false);
    chat.reset();
    greetedRef.current = false;
    resetActions();
  };

  const handleSend = () => {
    if (!textInput.trim()) return;
    chat.send(textInput.trim());
    setTextInput("");
  };

  const statusLabel = voice.isSpeaking
    ? `${displayName} is speaking…`
    : voice.isListening
    ? "Listening…"
    : chat.thinking
    ? "Thinking…"
    : "Ready";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-5 pb-12" style={{ paddingTop: "calc(var(--header-h, 56px) + 2rem)" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] flex flex-col gap-5"
      >
        <h1 className="font-display text-4xl font-bold text-foreground text-center leading-tight">
          What do you want to do?
        </h1>

        {/* Tap to talk */}
        <div className="flex flex-col items-center gap-3 py-4">
          <button onClick={handleMicTap} className="relative flex items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{ background: "hsl(16 80% 58% / 0.15)" }}
                animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
                initial={{ width: 112, height: 112 }}
              />
            ))}
            <div className="w-44 h-44 rounded-full bg-accent/10 flex items-center justify-center relative z-10">
              <motion.div
                className="w-28 h-28 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Mic className="w-12 h-12 text-white" />
              </motion.div>
            </div>
          </button>
          <div className="text-center">
            <p className="font-display text-lg font-semibold text-foreground">Tap to talk</p>
            <p className="text-sm text-muted-foreground">Start a voice chat with {displayName}</p>
          </div>
        </div>

        {/* Decision Mode – Delegate */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border-2 border-accent bg-card p-5 shadow-sm"
        >
          <h2 className="font-display text-lg font-bold text-foreground mb-1">Decision Mode–Delegate</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tell {displayName} what you need. {displayName} will handle the thinking.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/decision/text")}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-accent-foreground active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 38%))" }}
            >
              Text
            </button>
            <button
              onClick={() => navigate("/decision/voice")}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-accent-foreground active:scale-[0.98] transition-all"
              style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 38%))" }}
            >
              Voice
            </button>
          </div>
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-accent mt-3">
            ★ RECOMMENDED
          </p>
        </motion.div>

        {/* Detail Mode – Collaborate */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="font-display text-lg font-bold text-foreground mb-1">Detail Mode–Collaborate</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Open your workspace and work side-by-side with {displayName}.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-foreground hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Enter Workspace
          </button>
        </motion.div>

        {/* Agent's Office */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="font-display text-lg font-bold text-foreground mb-1">{displayName}'s Office</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Step into {displayName}'s virtual office. Browse notifications, chat, and more.
          </p>
          <button
            onClick={() => navigate("/office")}
            className="w-full py-3 rounded-xl font-semibold text-sm text-accent-foreground active:scale-[0.98] transition-all"
            style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
          >
            Enter Office
          </button>
        </motion.div>
      </motion.div>

      {/* ── Voice Overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {voiceOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-0 z-[80] bg-background flex flex-col"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-accent-foreground font-bold text-sm shadow"
                  style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
                  animate={voice.isListening ? { scale: [1, 1.08, 1] } : voice.isSpeaking ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={{ repeat: voice.isListening || voice.isSpeaking ? Infinity : 0, duration: 0.8 }}
                >
                  {displayName.charAt(0)}
                </motion.div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{displayName}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${voice.isSpeaking ? "bg-primary" : voice.isListening ? "bg-destructive animate-pulse" : chat.thinking ? "bg-accent animate-pulse" : "bg-green-500"}`} />
                    <p className="text-xs text-muted-foreground">{statusLabel}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
              {chat.messages.length === 0 && !chat.thinking && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <motion.div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-accent-foreground font-bold text-2xl shadow-lg"
                    style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
                    animate={voice.isListening ? { scale: [1, 1.1, 1], boxShadow: ["0 0 0 0 hsl(16 80% 58% / 0.4)", "0 0 0 20px hsl(16 80% 58% / 0)", "0 0 0 0 hsl(16 80% 58% / 0)"] } : {}}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  >
                    {displayName.charAt(0)}
                  </motion.div>
                  <p className="font-display text-lg font-semibold text-foreground">
                    {voice.isListening ? "Listening…" : voice.isSpeaking ? `${displayName} is speaking…` : "Ready — just talk"}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {voice.speechRecognitionBlockedByPwa
                      ? "Mic unavailable in installed app — type below."
                      : `Ask ${displayName} anything. Draft emails, schedule meetings, get answers.`}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {chat.messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user" ? "text-accent-foreground" : "bg-secondary text-secondary-foreground"
                      }`}
                      style={msg.role === "user" ? { background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 38%))" } : {}}
                    >
                      {msg.role === "agent" ? (
                        <>
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{stripAgentBlocks(msg.text)}</ReactMarkdown>
                          </div>
                          <DraftJsonParser text={msg.text} />
                          <CalendarJsonParser text={msg.text} />
                          <ContactJsonParser text={msg.text} />
                        </>
                      ) : msg.text}
                    </div>
                  </motion.div>
                ))}
                {chat.thinking && (
                  <div className="flex justify-start">
                    <div className="bg-secondary text-secondary-foreground rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Thinking…</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input bar */}
            <div className="border-t bg-background px-4 py-3 shrink-0">
              {voice.speechRecognitionBlockedByPwa && (
                <p className="text-xs text-muted-foreground mb-2 leading-snug">
                  Mic unavailable in installed app on iOS — type below. {displayName} will speak replies aloud.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={voice.conversationActive ? "Or type instead…" : "Type a message…"}
                  className="flex-1"
                />
                <VoiceWaveform isActive={voice.isListening} />
                <button
                  onClick={() => {
                    if (voice.speechRecognitionBlockedByPwa) { voice.toggleConversation(); return; }
                    if (voice.isSupported) voice.toggleConversation();
                  }}
                  disabled={!voice.isSupported && !voice.speechRecognitionBlockedByPwa}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                    voice.conversationActive
                      ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
                      : "text-accent-foreground shadow-md"
                  }`}
                  style={!voice.conversationActive ? { background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" } : {}}
                >
                  {voice.conversationActive ? <PhoneOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                {textInput.trim() && (
                  <button
                    onClick={handleSend}
                    disabled={chat.thinking}
                    className="w-11 h-11 rounded-xl text-accent-foreground flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 shrink-0"
                    style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 38%))" }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
