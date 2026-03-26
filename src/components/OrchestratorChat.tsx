import { useState, useRef, useEffect } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Zap, Trash2, Settings, Sun, MailSearch, Clock, CalendarClock, FileText, Users, Plane, Gavel, FileBarChart, CalendarSearch, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ElementType;
  color: string;
}

const quickActions: QuickAction[] = [
  { label: "Morning Briefing", prompt: "Give me my morning briefing. Summarize what I need to know today — key emails, meetings, follow-ups, and priorities.", icon: Sun, color: "bg-accent/10 text-accent" },
  { label: "Email Triage", prompt: "Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.", icon: MailSearch, color: "bg-destructive/10 text-destructive" },
  { label: "Follow-Ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply? Draft polite follow-up messages for the overdue ones.", icon: Clock, color: "bg-primary/10 text-primary" },
  { label: "Meeting Prep", prompt: "Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.", icon: CalendarClock, color: "bg-info/10 text-info" },
  { label: "Schedule a Meeting", prompt: "Help me find the best time for a new meeting this week. Consider my calendar density and buffer preferences.", icon: CalendarSearch, color: "bg-accent/10 text-accent" },
  { label: "Weekly Report", prompt: "Generate my weekly report. Summarize accomplishments, in-progress items, things needing attention, and next week's priorities.", icon: FileBarChart, color: "bg-primary/10 text-primary" },
  { label: "Summarize a Doc", prompt: "I need to summarize a document. I'll paste the text — give me an executive summary with key takeaways and action items.", icon: FileText, color: "bg-muted text-muted-foreground" },
  { label: "Contact Lookup", prompt: "Help me look up a contact. I'll give you a name — pull together what you know about our interaction history and open threads.", icon: Users, color: "bg-info/10 text-info" },
];

export const OrchestratorChat = () => {
  const { agentName } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    if (!overrideText) setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      // Get user session token for real data access
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          agentName,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        upsertAssistant(`⚠️ ${err.error || "Something went wrong. Please try again."}`);
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      upsertAssistant("⚠️ Connection error. Please try again.");
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    handleSend(action.prompt);
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8">
            {/* Hero */}
            <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center mb-6 shadow-lg">
              <Zap className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2 text-center">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}
            </h1>
            <p className="text-muted-foreground text-center max-w-lg mb-8">
              I'm {agentName}, your executive assistant. I can handle your emails, prep your meetings, track follow-ups, and keep your day on track.
            </p>

            {/* Quick action cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action)}
                    className="group flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 text-center"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color} transition-transform group-hover:scale-110`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                style={{ animation: "fade-up 0.3s ease-out both" }}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center mr-3 mt-1 shrink-0">
                    <Zap className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-accent prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center mr-3 shrink-0">
                  <Zap className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-card border border-border rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick action pills when in conversation */}
      {messages.length > 0 && !isLoading && (
        <div className="flex gap-2 overflow-x-auto px-2 py-2 scrollbar-none">
          {quickActions.slice(0, 4).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors whitespace-nowrap shrink-0"
              >
                <Icon className="w-3 h-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Input bar */}
      <div className="px-2 pb-2 pt-1">
        <div className="bg-card border border-border rounded-2xl flex items-end gap-2 p-2 shadow-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${agentName} anything…`}
            rows={1}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-32"
            style={{ minHeight: "40px" }}
          />
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          {agentName} can manage emails, meetings, follow-ups, contacts, travel, and more
        </p>
      </div>
    </div>
  );
};
