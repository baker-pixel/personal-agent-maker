import { useState, useRef, useEffect } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Sun, MailSearch, Clock, CalendarClock, FileText, Users, FileBarChart, CalendarSearch } from "lucide-react";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatHero } from "./chat/ChatHero";
import { QuickActionGrid } from "./chat/QuickActionGrid";
import { QuickActionPills } from "./chat/QuickActionPills";

export type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ElementType;
  color: string;
}

export const quickActions: QuickAction[] = [
  { label: "Morning Briefing", prompt: "Give me my morning briefing. Summarize what I need to know today — key emails, meetings, follow-ups, and priorities.", icon: Sun, color: "text-accent" },
  { label: "Email Triage", prompt: "Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.", icon: MailSearch, color: "text-destructive" },
  { label: "Follow-Ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply? Draft polite follow-up messages for the overdue ones.", icon: Clock, color: "text-primary" },
  { label: "Meeting Prep", prompt: "Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.", icon: CalendarClock, color: "text-info" },
  { label: "Schedule", prompt: "Help me find the best time for a new meeting this week. Consider my calendar density and buffer preferences.", icon: CalendarSearch, color: "text-accent" },
  { label: "Weekly Report", prompt: "Generate my weekly report. Summarize accomplishments, in-progress items, things needing attention, and next week's priorities.", icon: FileBarChart, color: "text-primary" },
  { label: "Summarize Doc", prompt: "I need to summarize a document. I'll paste the text — give me an executive summary with key takeaways and action items.", icon: FileText, color: "text-muted-foreground" },
  { label: "Contact Lookup", prompt: "Help me look up a contact. I'll give you a name — pull together what you know about our interaction history and open threads.", icon: Users, color: "text-info" },
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
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1 md:px-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <ChatHero agentName={agentName} />
            <QuickActionGrid actions={quickActions} onAction={handleQuickAction} />
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              messagesEndRef={messagesEndRef}
            />
          </>
        )}
      </div>

      {/* Quick action pills when in conversation */}
      {messages.length > 0 && !isLoading && (
        <QuickActionPills actions={quickActions.slice(0, 4)} onAction={handleQuickAction} />
      )}

      {/* Input bar */}
      <div className="px-3 md:px-6 pb-4 pt-2">
        <div className="bg-card border border-border/60 rounded-2xl flex items-end gap-2 p-2 shadow-sm focus-within:border-primary/20 focus-within:shadow-md transition-all duration-200">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agentName}…`}
            rows={1}
            className="flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none max-h-32"
            style={{ minHeight: "44px" }}
          />
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="shrink-0 px-3 py-2.5 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
