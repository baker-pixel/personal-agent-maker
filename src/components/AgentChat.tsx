import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { Send, Loader2, Zap, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DraftJsonParser } from "@/components/chat/DraftJsonParser";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const DETAIL_TITLE = "Detail";

async function persistMessage(conversationId: string, role: string, content: string) {
  await supabase.from("chat_messages").insert({ conversation_id: conversationId, role, content });
  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export const AgentChat = () => {
  const { agentName } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Resume most recent Detail conversation on mount (within 24h, capped at 200 msgs)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("title", DETAIL_TITLE)
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!existing || existing.length === 0 || cancelled) return;
      convIdRef.current = existing[0].id;
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", existing[0].id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (msgs && msgs.length > 0 && !cancelled) {
        setMessages(
          [...msgs].reverse().map((m) => ({
            role: m.role === "user" ? "user" as const : "assistant" as const,
            content: m.content,
          }))
        );
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Ensure a conversation exists, then persist user message
    if (!convIdRef.current) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: created } = await supabase
          .from("chat_conversations")
          .insert({ user_id: session.user.id, title: DETAIL_TITLE })
          .select("id")
          .single();
        if (created) convIdRef.current = created.id;
      }
    }
    if (convIdRef.current) persistMessage(convIdRef.current, "user", text);

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
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

    // Persist assistant response
    if (convIdRef.current && assistantSoFar) {
      persistMessage(convIdRef.current, "assistant", assistantSoFar);
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-1">Chat</h1>
          <p className="text-muted-foreground text-sm">Talk to {agentName} directly</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-accent" />
            </div>
            <h2 className="font-display text-xl text-foreground mb-2">
              What can I help with?
            </h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Ask {agentName} to draft emails, organize tasks, summarize documents, plan your day, or anything else an executive assistant would handle.
            </p>
            <div className="w-full max-w-sm space-y-2 mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">
                Things {agentName} can handle for you
              </p>
              {[
                { emoji: "📧", label: "Triage my inbox", prompt: "Go through my inbox and tell me what's urgent, what needs a reply, and what I can ignore." },
                { emoji: "📅", label: "Prep me for my next meeting", prompt: "Look at my upcoming meetings and prepare a brief with context, talking points, and anything I should know about the attendees." },
                { emoji: "✍️", label: "Draft a follow-up email", prompt: "Help me draft a professional follow-up email. I'll give you the context." },
                { emoji: "📋", label: "Summarize my action items", prompt: "Review my tasks and action items, then give me a prioritized summary of what I should focus on today." },
                { emoji: "📰", label: "Catch me up on industry news", prompt: "Give me a quick brief on the latest news relevant to my industry and interests." },
                { emoji: "🗓️", label: "Plan my week", prompt: "Help me plan and organize my upcoming week based on my calendar and priorities." },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { setInput(item.prompt); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/40 text-left text-sm text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.03] transition-all duration-200"
                >
                  <span className="text-base">{item.emoji}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            style={{ animation: `fade-up 0.3s ease-out both` }}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "glass-card"
              }`}
            >
              {msg.role === "assistant" ? (
                <>
                  <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-accent prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                    <ReactMarkdown>{msg.content.replace(/```draft-json[\s\S]*?```/g, "")}</ReactMarkdown>
                  </div>
                  <DraftJsonParser text={msg.content} />
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="glass-card rounded-2xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions + Input */}
      <div className="border-t border-border pt-3">
        {!isLoading && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 px-1">
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
                onClick={() => setInput(item.prompt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.03] transition-all duration-200 whitespace-nowrap shrink-0"
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="glass-card rounded-2xl flex items-end gap-2 p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agentName}...`}
            rows={1}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none max-h-32"
            style={{ minHeight: "40px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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
