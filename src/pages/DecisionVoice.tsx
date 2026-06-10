import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MicOff, Send, Loader2, Plus, PanelLeft, Volume2, VolumeX, PhoneOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { DelegateSidebar } from "@/components/chat/DelegateSidebar";
import ReactMarkdown from "react-markdown";
import { useAgent } from "@/contexts/AgentContext";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
import { VoiceSettingsPanel } from "@/components/VoiceSettingsPanel";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { NotConnectedState } from "@/components/NotConnectedState";

export default function DecisionVoice() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const { isConnected, integrationsLoading } = useIntegrations();
  const gmailConnected = isConnected("gmail");
  const [input, setInput] = useState("");
  const [voiceJustFilled, setVoiceJustFilled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Shared voice session — same greeting, TTS, and mic behavior as ModeSelect
  const { chat, voice, resetSession, handleMicTap } = useVoiceSession(agentName, {
    onUserUtterance: (text) => {
      setInput(text);
      setVoiceJustFilled(true);
      setTimeout(() => setVoiceJustFilled(false), 2000);
      // No auto-focus: prevents mobile keyboard from popping up and accidental
      // Enter/Go key submission. User explicitly taps Send to confirm.
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const handleSend = () => {
    if (!input.trim()) return;
    chat.send(input.trim());
    setInput("");
  };

  return (
    <div className="h-[100dvh] bg-background flex pt-[var(--header-h)]">
      <DelegateSidebar
        conversations={chat.conversations}
        activeId={chat.activeConversationId}
        onSelect={(id) => { chat.loadConversation(id); setSidebarOpen(false); }}
        onNew={() => { chat.reset(); setSidebarOpen(false); }}
        onDelete={chat.deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        agentName={agentName}
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <nav className="border-b bg-background sticky top-0 z-50">
          <div className="container flex items-center h-14 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors lg:hidden mr-1"
              aria-label="Open conversations"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { voice.stopConversation(); navigate("/dashboard"); }}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="flex-1" />
            <button
              onClick={voice.toggleTts}
              title={voice.ttsEnabled ? "Mute Normy's voice" : "Unmute Normy's voice"}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mr-1"
            >
              {voice.ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <VoiceSettingsPanel
              voices={voice.voices}
              voiceURI={voice.voiceURI}
              onVoiceChange={voice.setVoiceURI}
              rate={voice.rate}
              onRateChange={voice.setRate}
              pitch={voice.pitch}
              onPitchChange={voice.setPitch}
              onPreview={voice.previewVoice}
              isSupported={voice.ttsSupported}
              sttLanguage={voice.sttLanguage}
              onSttLanguageChange={voice.setSttLanguage}
              provider={voice.provider}
              onProviderChange={voice.setProvider}
              groqVoiceId={voice.groqVoiceId}
              onGroqVoiceChange={voice.setGroqVoiceId}
            />
            <button
              onClick={resetSession}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent/50"
            >
              <Plus className="w-3.5 h-3.5" />
              New chat
            </button>
          </div>
          {!integrationsLoading && !gmailConnected && (
            <NotConnectedState integration="both" variant="inline" agentName={agentName} />
          )}
        </nav>

        <div className="flex-1 container max-w-lg mx-auto w-full py-6 px-4 overflow-y-auto min-h-0">
          {chat.loading && (
            <div className="flex items-center justify-center h-full pt-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!chat.loading && chat.messages.length === 0 && !chat.thinking && !voice.isListening && !voice.conversationActive && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center pt-20"
            >
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-xl mb-4">
                {agentName.charAt(0)}
              </div>
              <p className="font-display text-lg font-semibold text-foreground mb-1">Ready to chat</p>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">
                Tap the mic to start a voice session with {agentName}, or type below.
              </p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                Tip: on iPhone, set up "Hey Siri, talk to {agentName}" — see <a href="/normy-siri-shortcut.txt" target="_blank" rel="noreferrer" className="underline hover:text-foreground">setup guide</a>.
              </p>
            </motion.div>
          )}

          {voice.conversationActive && chat.messages.length === 0 && !chat.thinking && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full text-center pt-20"
            >
              <div className={`w-20 h-20 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-2xl mb-4 transition-all ${voice.isListening ? "animate-pulse shadow-lg shadow-accent/40" : voice.isSpeaking ? "shadow-lg shadow-primary/40" : ""}`}>
                {agentName.charAt(0)}
              </div>
              <p className="font-display text-lg font-semibold text-foreground mb-1">
                {voice.isSpeaking ? `${agentName} is speaking…` : voice.isListening ? "Listening…" : "Ready"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {voice.isListening
                  ? `Tap mic to send — ${agentName} will reply out loud.`
                  : `Tap mic to speak. ${agentName} will reply out loud.`}
              </p>
            </motion.div>
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
                  className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {msg.role === "agent" ? (
                    <>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{stripAgentBlocks(msg.text)}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    msg.text
                  )}
                </div>
              </motion.div>
            ))}
            {chat.thinking && (
              <div className="flex justify-start">
                <div className="bg-secondary text-secondary-foreground rounded-2xl px-4 py-3 text-sm">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-background sticky bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
          {voice.speechRecognitionBlockedByPwa && (
            <div className="container max-w-lg pt-3 px-4">
              <div className="text-xs bg-muted/60 text-muted-foreground rounded-lg px-3 py-2 leading-snug">
                Mic input isn't available in the installed app on iOS — type your message and {agentName} will <strong>speak the reply aloud</strong>. For full hands-free voice, open <a href="https://normyagent.com" className="underline">normyagent.com</a> in Safari.
              </div>
            </div>
          )}

          {/* Status bar — only when conversation is active */}
          {voice.conversationActive && (
            <div className="container max-w-lg flex items-center justify-between gap-2 pt-3 px-4">
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
                voice.isSpeaking
                  ? "bg-primary/10 text-primary"
                  : voice.isTranscribing
                    ? "bg-accent/10 text-accent"
                    : voice.isListening
                      ? "bg-destructive/10 text-destructive"
                      : input.trim()
                        ? "bg-accent/10 text-accent"
                        : chat.thinking
                          ? "bg-muted text-muted-foreground"
                          : "bg-muted text-muted-foreground"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  voice.isSpeaking ? "bg-primary animate-pulse" :
                  voice.isTranscribing ? "bg-accent animate-pulse" :
                  voice.isListening ? "bg-destructive animate-pulse" :
                  input.trim() ? "bg-accent" :
                  "bg-muted-foreground"
                }`} />
                {voice.isSpeaking
                  ? `${agentName} speaking…`
                  : voice.isTranscribing
                    ? "Transcribing…"
                    : voice.isListening
                      ? "Recording — tap mic to stop"
                      : chat.thinking
                        ? "Thinking…"
                        : input.trim()
                          ? "Review your message, then tap Send →"
                          : "Tap mic to speak"}
              </div>
              <button
                onClick={() => voice.stopConversation()}
                title="End voice session"
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded-lg hover:bg-destructive/10"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                End
              </button>
            </div>
          )}

          <div className="container max-w-lg flex items-center gap-2 py-3 px-4">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={
                voice.isTranscribing
                  ? "Transcribing…"
                  : voice.conversationActive
                    ? "Or type instead…"
                    : "Type a message…"
              }
              disabled={voice.isTranscribing}
              className={`flex-1 transition-all duration-300 ${voiceJustFilled ? "ring-2 ring-primary/60 border-primary/50 bg-primary/5" : ""}`}
            />
            <VoiceWaveform isActive={voice.isListening} />

            {/* Mic / PTT button */}
            <button
              onClick={handleMicTap}
              disabled={!voice.isSupported && !voice.speechRecognitionBlockedByPwa}
              title={
                voice.isTranscribing
                  ? "Transcribing — tap to record again"
                  : voice.speechRecognitionBlockedByPwa
                  ? voice.conversationActive ? "Mute voice replies" : "Enable voice replies"
                  : !voice.isSupported
                    ? "Voice not supported — try Chrome, Edge, or Safari"
                    : !voice.conversationActive
                      ? `Start a voice session with ${agentName}`
                      : voice.isListening
                        ? "Tap to stop recording"
                        : "Tap to speak"
              }
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0 ${
                !voice.isSupported && !voice.speechRecognitionBlockedByPwa
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : voice.isTranscribing
                    ? "bg-accent text-accent-foreground opacity-70"
                    : voice.isListening
                      ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/40 animate-pulse"
                      : voice.conversationActive
                        ? "bg-accent text-accent-foreground shadow-md shadow-accent/30"
                        : "bg-accent text-accent-foreground shadow-md shadow-accent/20"
              }`}
            >
              {voice.isTranscribing
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : voice.isListening
                  ? <MicOff className="w-5 h-5" />
                  : <Mic className="w-5 h-5" />
              }
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || chat.thinking}
              className={`w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                input.trim() && !chat.thinking
                  ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/30"
                  : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
              }`}
              title={input.trim() ? "Send message" : "Speak or type a message first"}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
