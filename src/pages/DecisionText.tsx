import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import ReactMarkdown from "react-markdown";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";

export default function DecisionText() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Annie");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try { setAgentName(JSON.parse(stored).agentName || "Annie"); } catch {}
    }
  }, []);

  const chat = useAnnieChat(agentName);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.thinking]);

  const handleSend = () => {
    if (!input.trim()) return;
    chat.send(input.trim());
    setInput("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center h-14">
          <button
            onClick={() => navigate("/mode-select")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex-1" />
          {chat.messages.length > 0 && (
            <button
              onClick={chat.reset}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent/50"
            >
              <Plus className="w-3.5 h-3.5" />
              New chat
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 container max-w-lg py-6 px-4 overflow-y-auto">
        {chat.loading && (
          <div className="flex items-center justify-center h-full pt-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!chat.loading && chat.messages.length === 0 && !chat.thinking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center pt-20"
          >
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-xl mb-4">
              {agentName.charAt(0)}
            </div>
            <p className="font-display text-lg font-semibold text-foreground mb-1">What do you need?</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Tell {agentName} what's on your mind. She'll think it through and give you a recommendation.
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
        <div className="container max-w-lg flex gap-2 py-3 px-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Tell ${agentName} what you need...`}
            className="flex-1"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chat.thinking}
            className="w-11 h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
