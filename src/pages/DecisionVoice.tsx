import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MicOff, Send, Loader2, Plus, PanelLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { DelegateSidebar } from "@/components/chat/DelegateSidebar";
import ReactMarkdown from "react-markdown";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";
import { useAgent } from "@/contexts/AgentContext";

export default function DecisionVoice() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = useAnnieChat(agentName);
  const speech = useSpeechRecognition({
    onResult: (text) => setInput((prev) => (prev ? prev + " " : "") + text),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const handleSend = () => {
    if (!input.trim()) return;
    speech.stopListening();
    chat.send(input.trim());
    setInput("");
  };

  return (
    <div className="min-h-screen bg-background flex">
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
        <nav className="border-b bg-background sticky top-0 z-50">
          <div className="container flex items-center h-14">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors lg:hidden mr-1"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate("/mode-select")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="flex-1" />
            <button
              onClick={chat.reset}
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

          {!chat.loading && chat.messages.length === 0 && !chat.thinking && !speech.isListening && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center pt-20"
            >
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-xl mb-4">
                {agentName.charAt(0)}
              </div>
              <p className="font-display text-lg font-semibold text-foreground mb-1">I'm listening</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Tap the mic and tell {agentName} what you need. {agentName} will think it through for you.
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

        <div className="border-t bg-background sticky bottom-0 z-50">
          <div className="container max-w-lg flex items-center gap-2 py-3 px-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={speech.isListening ? "Listening..." : `Or type here...`}
              className="flex-1"
            />
            <VoiceWaveform isActive={speech.isListening} />
            <button
              onClick={speech.isSupported ? speech.toggleListening : undefined}
              disabled={!speech.isSupported}
              title={!speech.isSupported ? "Voice input is not supported in this browser. Try Chrome or Edge." : speech.isListening ? "Stop listening" : "Start listening"}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                !speech.isSupported
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : speech.isListening
                    ? "bg-destructive text-destructive-foreground animate-pulse shadow-lg shadow-destructive/30"
                    : "bg-accent text-accent-foreground shadow-md shadow-accent/20"
              }`}
            >
              {speech.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
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
