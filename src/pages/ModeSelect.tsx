import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Send, Loader2, MessageSquare } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

export default function ModeSelect() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const displayName = agentName || "Normy Agent";

  const [voiceOpen, setVoiceOpen] = useState(false);
  // Only enable chat hook (and its DB queries) on first mic tap
  const [hookEnabled, setHookEnabled] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [voiceJustFilled, setVoiceJustFilled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Shared voice session — same greeting, TTS, and mic behavior as DecisionVoice.
  // Separate conversation title so quick sessions don't pollute Delegate history.
  const { chat, voice, startSession, resetSession, handleMicTap, voiceEngine } = useVoiceSession(displayName, {
    conversationTitle: "Quick Chat",
    enabled: hookEnabled,
    skipInitialLoad: true,
    onUserUtterance: (text) => {
      setTextInput(text);
      setVoiceJustFilled(true);
      setTimeout(() => setVoiceJustFilled(false), 2000);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  // "Talk to {agent}" / big mic circle: open the overlay and start a session
  const handleOpenVoice = () => {
    if (!hookEnabled) setHookEnabled(true);
    setVoiceOpen(true);
    if (!voice.conversationActive) startSession();
  };

  const handleClose = () => {
    resetSession();
    setVoiceOpen(false);
  };

  const handleSend = () => {
    if (!textInput.trim()) return;
    chat.send(textInput.trim());
    setTextInput("");
  };

  const handsFree = voiceEngine === "sonic";

  const statusLabel = voice.isSpeaking
    ? handsFree ? "Speaking — talk to interrupt" : `${displayName} is speaking…`
    : voice.isTranscribing
    ? "Transcribing…"
    : voice.isListening
    ? handsFree ? "Listening — just speak" : "Recording — tap mic to stop"
    : textInput.trim()
    ? "Review your message, then tap Send →"
    : chat.thinking
    ? "Thinking…"
    : voice.isConnecting
    ? "Starting voice session…"
    : handsFree && voice.conversationActive
    ? "Listening — just speak"
    : "Tap mic to speak";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 pb-12" style={{ paddingTop: "var(--header-h, 56px)" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] flex flex-col gap-5"
      >
        <h1 className="font-display text-3xl font-bold text-foreground text-center leading-tight">
          What do you want to do?
        </h1>

        {/* Tap to talk */}
        <div className="flex flex-col items-center gap-3 py-4">
          <button onClick={handleOpenVoice} className="relative flex items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{ background: "hsl(16 80% 58% / 0.15)", width: 112, height: 112 }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 1.8], opacity: [0, 0.6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
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
          <div className="flex gap-3 w-full max-w-xs mt-8">
            <button
              onClick={() => navigate("/decision/text")}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold text-accent-foreground active:scale-[0.97] transition-all shadow-md shadow-accent/20 whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              Text {displayName}
            </button>
            <button
              onClick={handleOpenVoice}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold text-accent-foreground active:scale-[0.97] transition-all shadow-md shadow-accent/20 whitespace-nowrap"
              style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
            >
              <Mic className="w-4 h-4 shrink-0" />
              Talk to {displayName}
            </button>
          </div>
        </div>

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
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <motion.div
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-accent-foreground font-bold text-sm shadow"
                  style={{ background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" }}
                  animate={voice.isListening ? { scale: [1, 1.08, 1] } : voice.isSpeaking ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={{ repeat: voice.isListening || voice.isSpeaking ? Infinity : 0, duration: 0.8 }}
                >
                  {displayName.charAt(0)}
                </motion.div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight truncate">{displayName}</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${voice.isSpeaking ? "bg-primary" : voice.isListening ? "bg-destructive animate-pulse" : chat.thinking ? "bg-accent animate-pulse" : "bg-green-500"}`} />
                    <p className="text-xs text-muted-foreground truncate">{statusLabel}</p>
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
                    {voice.isListening
                      ? handsFree ? "Listening…" : "Recording…"
                      : voice.isSpeaking
                        ? `${displayName} is speaking…`
                        : chat.thinking
                          ? "Thinking…"
                          : voice.isConnecting
                            ? "Starting voice session…"
                            : handsFree && voice.conversationActive
                              ? "Listening…"
                              : "Tap mic to speak"}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {voice.speechRecognitionBlockedByPwa
                      ? "Mic unavailable in installed app — type below."
                      : handsFree
                        ? voice.isConnecting
                          ? "Connecting — you can start talking in a moment."
                          : `Hands-free — just talk. Tap mic to end.`
                        : voice.isListening
                          ? `Tap mic again to send to ${displayName}.`
                          : `Tap the mic, speak, then tap again to send.`}
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
              {/* Status strip */}
              {voice.conversationActive && (
                <div className={`flex items-center gap-2 mb-2 px-1 text-xs font-medium ${
                  voice.isListening ? "text-destructive" : voice.isSpeaking ? "text-primary" : "text-muted-foreground"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    voice.isListening ? "bg-destructive animate-pulse" :
                    voice.isSpeaking ? "bg-primary animate-pulse" : "bg-muted-foreground"
                  }`} />
                  {statusLabel}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={voice.isTranscribing ? "Transcribing…" : "Or type instead…"}
                  disabled={voice.isTranscribing}
                  className={`flex-1 transition-all duration-300 ${voiceJustFilled ? "ring-2 ring-primary/60 border-primary/50 bg-primary/5" : ""}`}
                />
                <VoiceWaveform isActive={voice.isListening} />
                {/* PTT mic button */}
                <button
                  onClick={handleMicTap}
                  disabled={!voice.isSupported && !voice.speechRecognitionBlockedByPwa}
                  title={
                    voice.isTranscribing
                      ? "Transcribing — tap to record again"
                      : voice.isListening
                        ? "Tap to stop recording"
                        : "Tap to speak"
                  }
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                    voice.isListening
                      ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 animate-pulse"
                      : voice.isTranscribing
                        ? "text-white shadow-lg opacity-70"
                        : "text-white shadow-lg"
                  }`}
                  style={!voice.isListening ? { background: "linear-gradient(135deg, hsl(16 80% 52%), hsl(16 60% 32%))" } : {}}
                >
                  {voice.isTranscribing
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : voice.isListening
                      ? <MicOff className="w-5 h-5" />
                      : <Mic className="w-5 h-5" />
                  }
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
