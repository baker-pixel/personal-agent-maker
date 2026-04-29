import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MicOff, Send, Loader2, Plus, PanelLeft, Volume2, VolumeX, PhoneOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { DelegateSidebar } from "@/components/chat/DelegateSidebar";
import ReactMarkdown from "react-markdown";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";
import { useAgent } from "@/contexts/AgentContext";
import { VoiceSettingsPanel } from "@/components/VoiceSettingsPanel";

export default function DecisionVoice() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [firstName, setFirstName] = useState<string>("");
  const greetedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = useAnnieChat(agentName, "voice");

  // Resolve the user's first name for the greeting
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const meta = (u?.user_metadata ?? {}) as Record<string, any>;
      const raw =
        meta.first_name ||
        meta.given_name ||
        meta.full_name ||
        meta.name ||
        (u?.email ? u.email.split("@")[0] : "");
      const first = String(raw).trim().split(/\s+/)[0] || "";
      // Capitalize if it came from an email handle
      setFirstName(first ? first.charAt(0).toUpperCase() + first.slice(1) : "");
    });
  }, []);

  // Latest agent reply (used to trigger TTS)
  const latestAgentReply = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "agent") {
        // Strip code blocks (e.g. draft-json) before speaking
        return chat.messages[i].text.replace(/```[\s\S]*?```/g, "").trim();
      }
    }
    return null;
  }, [chat.messages]);

  // Greeting spoken once when the voice conversation first starts
  const greeting = useMemo(() => {
    const who = firstName ? firstName : "there";
    return `Hey ${who}, how can I help?`;
  }, [firstName]);

  const [pendingGreeting, setPendingGreeting] = useState<string | null>(null);

  const voice = useVoiceConversation({
    onUserUtterance: (text) => {
      chat.send(text);
    },
    // Speak the greeting first; then defer to the live conversation thread
    agentReply: pendingGreeting ?? (chat.thinking ? null : latestAgentReply),
    thinking: chat.thinking,
  });

  // Once the conversation becomes active AND voice prefs are loaded, queue the
  // greeting (only once per page visit). Waiting on prefsLoaded ensures the
  // greeting uses the user's saved ElevenLabs voice rather than the default.
  useEffect(() => {
    if (voice.conversationActive && voice.prefsLoaded && !greetedRef.current && chat.messages.length === 0) {
      greetedRef.current = true;
      setPendingGreeting(greeting);
      // Clear after a tick so subsequent agent replies still trigger TTS via latestAgentReply
      const t = setTimeout(() => setPendingGreeting(null), 500);
      return () => clearTimeout(t);
    }
  }, [voice.conversationActive, voice.prefsLoaded, greeting, chat.messages.length]);

  // We deliberately do NOT auto-start on the first pointerdown anywhere on the
  // page — on mobile that handler eats the user's tap on Back/menu/etc. and
  // makes the page feel broken. The dedicated mic button (bottom-right) is the
  // single, explicit entry point for starting voice. This guarantees the gesture
  // context iOS needs to unlock SpeechSynthesis + Audio + getUserMedia.

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const handleSend = () => {
    if (!input.trim()) return;
    chat.send(input.trim());
    setInput("");
  };

  return (
    <div className="min-h-[100dvh] bg-background flex">
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

      <div className="flex-1 flex flex-col min-h-screen">
        <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="container flex items-center h-14 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors lg:hidden mr-1"
              aria-label="Open conversations"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { voice.stopConversation(); navigate("/mode-select"); }}
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
              elevenlabsVoiceId={voice.elevenlabsVoiceId}
              onElevenlabsVoiceChange={voice.setElevenlabsVoiceId}
              elevenlabsModelId={voice.elevenlabsModelId}
              onElevenlabsModelChange={voice.setElevenlabsModelId}
              stability={voice.stability}
              onStabilityChange={voice.setStability}
              similarity={voice.similarity}
              onSimilarityChange={voice.setSimilarity}
            />
            <button
              onClick={() => { voice.stopConversation(); chat.reset(); }}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent/50"
            >
              <Plus className="w-3.5 h-3.5" />
              New chat
            </button>
          </div>
        </nav>

        <div className="flex-1 container max-w-lg py-6 px-4 overflow-y-auto">
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
                Tap the call button to start a hands-free conversation with {agentName}, or type below.
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
                Just talk. {agentName} will reply out loud — you can interrupt anytime.
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {msg.role === "agent" ? (
                    <>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{msg.text.replace(/```draft-json[\s\S]*?```/g, "")}</ReactMarkdown>
                      </div>
                      <DraftJsonParser text={msg.text} />
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
          {voice.conversationActive && (
            <div className="container max-w-lg flex items-center justify-center gap-2 pt-3 px-4">
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
                voice.isSpeaking
                  ? "bg-primary/10 text-primary"
                  : voice.isListening
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${voice.isSpeaking ? "bg-primary" : voice.isListening ? "bg-destructive animate-pulse" : "bg-muted-foreground"}`} />
                {voice.isSpeaking ? `${agentName} speaking` : voice.isListening ? "Listening — interrupt anytime" : chat.thinking ? "Thinking…" : "Paused"}
              </div>
            </div>
          )}
          <div className="container max-w-lg flex items-center gap-2 py-3 px-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={voice.conversationActive ? "Or type instead…" : "Type a message…"}
              className="flex-1"
            />
            <VoiceWaveform isActive={voice.isListening} />
            <button
              onClick={() => {
                // In iOS PWA, the mic API is blocked but TTS works. Toggling
                // here at least unlocks SpeechSynthesis on the user gesture
                // and turns voice replies on/off, so tapping does *something*.
                if (voice.speechRecognitionBlockedByPwa) {
                  voice.toggleConversation();
                  return;
                }
                if (voice.isSupported) voice.toggleConversation();
              }}
              disabled={!voice.isSupported && !voice.speechRecognitionBlockedByPwa}
              title={
                voice.speechRecognitionBlockedByPwa
                  ? voice.conversationActive
                    ? "Mute Normy's voice replies"
                    : "Tap to enable Normy's voice replies (mic input not available in installed app on iOS)"
                  : !voice.isSupported
                    ? "Voice is not supported in this browser. Try Chrome, Edge, or Safari."
                    : voice.conversationActive
                      ? "End voice conversation"
                      : `Start hands-free conversation with ${agentName}`
              }
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                !voice.isSupported && !voice.speechRecognitionBlockedByPwa
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : voice.conversationActive
                    ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
                    : "bg-accent text-accent-foreground shadow-md shadow-accent/20"
              }`}
            >
              {voice.conversationActive ? <PhoneOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            {input.trim() && (
              <button
                onClick={handleSend}
                disabled={chat.thinking}
                className="w-11 h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
