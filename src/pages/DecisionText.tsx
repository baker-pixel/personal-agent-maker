import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Loader2, Plus, PanelLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { DelegateSidebar } from "@/components/chat/DelegateSidebar";
import ReactMarkdown from "react-markdown";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";
import { CalendarJsonParser } from "@/components/chat/CalendarJsonParser";
import { ContactJsonParser } from "@/components/chat/ContactJsonParser";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { NotConnectedState } from "@/components/NotConnectedState";

export default function DecisionText() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const { isConnected, integrationsLoading } = useIntegrations();
  const gmailConnected = isConnected("gmail");
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate("/dashboard")}
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

          {!chat.loading && chat.messages.length === 0 && !chat.thinking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center pt-12"
            >
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-xl mb-4">
                {agentName.charAt(0)}
              </div>
              <p className="font-display text-lg font-semibold text-foreground mb-1">What do you need?</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Tell {agentName} what's on your mind. {agentName} will think it through and give you a recommendation.
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
                      <DraftJsonParser text={msg.text} />
                      <CalendarJsonParser text={msg.text} />
                      <ContactJsonParser text={msg.text} />
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
          {!chat.thinking && (
            <div className="container max-w-lg px-4 pt-3 pb-1">
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {[
                  { emoji: "📧", label: "Triage inbox", prompt: "Go through my inbox and tell me what's urgent, what needs a reply, and what I can ignore." },
                  { emoji: "📅", label: "Meeting prep", prompt: "Look at my upcoming meetings and prepare a brief with context, talking points, and anything I should know about the attendees." },
                  { emoji: "✍️", label: "Draft email", prompt: "Help me draft a professional follow-up email. I'll give you the context." },
                  { emoji: "📋", label: "Action items", prompt: "Review my tasks and action items, then give me a prioritized summary of what I should focus on today." },
                  { emoji: "📰", label: "Industry news", prompt: "Give me a quick brief on the latest news relevant to my industry and interests." },
                  { emoji: "🗓️", label: "Plan my week", prompt: "Help me plan and organize my upcoming week based on my calendar and priorities." },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { setInput(""); chat.send(item.prompt); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.03] transition-all duration-200 whitespace-nowrap shrink-0"
                  >
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="container max-w-lg flex gap-2 py-3 px-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={gmailConnected ? `Tell ${agentName} what you need...` : "Connect Gmail to start chatting"}
              disabled={!gmailConnected}
              className="flex-1"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chat.thinking || !gmailConnected}
              className="w-11 h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
