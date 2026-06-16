import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  Send, Loader2, Zap, Trash2,
  Mail, Calendar, ListTodo, Users, Inbox, ArrowRight,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
import { toast } from "@/hooks/use-toast";

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

// ─── Context-aware quick actions ─────────────────────────────────────────────

interface ContextAction {
  label: string;
  icon: React.ElementType;
  path: string;
  color: string;
}

function detectContextActions(content: string): ContextAction[] {
  const lower = content.toLowerCase();
  const actions: ContextAction[] = [];

  if (lower.match(/\bemail|inbox|unread|urgent|reply|draft|triage|message\b/)) {
    actions.push({ label: "Open inbox", icon: Mail, path: "/email", color: "text-accent" });
  }
  if (lower.match(/\bmeeting|calendar|event|schedule|appointment|agenda\b/)) {
    actions.push({ label: "Open calendar", icon: Calendar, path: "/calendar", color: "text-accent" });
  }
  if (lower.match(/\btask|action item|todo|due|overdue|deadline\b/)) {
    actions.push({ label: "Open tasks", icon: ListTodo, path: "/tasks", color: "text-muted-foreground" });
  }
  if (lower.match(/\bapproval inbox|draft saved|waiting for approval|pending draft\b/)) {
    actions.push({ label: "Approval inbox", icon: Inbox, path: "/email", color: "text-green-600" });
  }
  if (lower.match(/\bcontact|person|colleague|client|vendor\b/)) {
    actions.push({ label: "Open contacts", icon: Users, path: "/contacts", color: "text-muted-foreground" });
  }

  return actions.slice(0, 3);
}

// ─── Time-based starter prompts ───────────────────────────────────────────────

interface StarterPrompt {
  emoji: string;
  label: string;
  prompt: string;
}

function getStarterPrompts(agentName: string): StarterPrompt[] {
  const h = new Date().getHours();

  if (h < 10) {
    return [
      { emoji: "🌅", label: "Morning briefing", prompt: "Give me a morning briefing — what's urgent in my inbox, what meetings do I have today, and what should I focus on first?" },
      { emoji: "⚡", label: "What's urgent?", prompt: "What needs my immediate attention right now — urgent emails, overdue tasks, or anything time-sensitive?" },
      { emoji: "📅", label: "Prep for next meeting", prompt: "Look at my upcoming meetings today and prepare a quick brief with context, attendees, and any talking points." },
      { emoji: "📋", label: "Today's priorities", prompt: "Based on my tasks and emails, what are the 3-5 things I should absolutely get done today?" },
      { emoji: "✍️", label: "Draft an email", prompt: "Help me draft a professional email. Tell me who it's to and what it's about." },
      { emoji: "🗓️", label: "Plan my week", prompt: "Help me plan my week based on my calendar, priorities, and any pending tasks." },
    ];
  }

  if (h < 14) {
    return [
      { emoji: "🔄", label: "Check follow-ups", prompt: "Are there emails I replied to that haven't gotten a response? What might need a follow-up?" },
      { emoji: "📧", label: "Triage my inbox", prompt: "Go through my inbox and tell me what's urgent, what needs a reply, and what I can safely ignore." },
      { emoji: "📅", label: "Afternoon meetings", prompt: "What meetings do I have this afternoon? Any prep I should do before them?" },
      { emoji: "✍️", label: "Draft an email", prompt: "Help me draft a professional email. Tell me who it's to and what it's about." },
      { emoji: "📋", label: "Task check-in", prompt: "How am I doing on my tasks for today? What's done, what's overdue, what still needs attention?" },
      { emoji: "🧠", label: "Quick decision", prompt: "I need help thinking through a decision. Let me explain the situation." },
    ];
  }

  // Evening
  return [
    { emoji: "🌆", label: "End of day wrapup", prompt: "Give me an end-of-day summary — what got done today, what's still pending, and what should I prioritize first thing tomorrow?" },
    { emoji: "📋", label: "Tomorrow's priorities", prompt: "Based on what's open and unfinished, help me set my top priorities for tomorrow." },
    { emoji: "📧", label: "Anything urgent?", prompt: "Is there anything urgent in my inbox I should handle before logging off for the day?" },
    { emoji: "🔄", label: "Pending follow-ups", prompt: "Are there any emails or tasks that I committed to but haven't completed yet?" },
    { emoji: "✍️", label: "Draft an email", prompt: "Help me draft a professional email before I wrap up." },
    { emoji: "🗓️", label: "Check tomorrow", prompt: "What's on my calendar for tomorrow? Anything I should prepare for tonight?" },
  ];
}

// ─── Smart follow-up chips ────────────────────────────────────────────────────

function getFollowUpChips(messages: Message[]): StarterPrompt[] {
  if (messages.length === 0) return [];
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return [];

  const lower = lastAssistant.content.toLowerCase();
  const chips: StarterPrompt[] = [];

  if (lower.match(/\burgent|priority|attention/)) {
    chips.push({ emoji: "📋", label: "Draft a reply", prompt: "Help me draft a reply for the most urgent email you just mentioned." });
  }
  if (lower.match(/\bmeeting|agenda|attendee/)) {
    chips.push({ emoji: "📝", label: "Draft talking points", prompt: "Draft concise talking points I can use in the meeting you just described." });
  }
  if (lower.match(/\btask|action item|todo/)) {
    chips.push({ emoji: "✅", label: "Add these as tasks", prompt: "Turn the action items you mentioned into a structured task list." });
  }
  if (lower.match(/\bfollow[- ]up|follow up/)) {
    chips.push({ emoji: "✉️", label: "Draft follow-up", prompt: "Draft a polite follow-up email for the situation you described." });
  }
  if (lower.match(/\bschedule|book|calendar|event/)) {
    chips.push({ emoji: "📅", label: "Add to calendar", prompt: "Help me create a calendar event for what you just mentioned." });
  }

  // Always offer "Tell me more"
  chips.push({ emoji: "🔍", label: "Tell me more", prompt: "Give me more details about the most important item you just mentioned." });

  return chips.slice(0, 4);
}

// ─── Main component ───────────────────────────────────────────────────────────

const ASSESSMENT_NUDGE_KEY = "normy_assessment_nudged";
const ASSESSMENT_NUDGE_AT = 4; // trigger after this many user messages

export const AgentChat = () => {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(null);
  const assessmentDoneRef = useRef(true); // assume done until loaded
  const nudgeSentRef = useRef(!!localStorage.getItem(ASSESSMENT_NUDGE_KEY));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Resume most recent Detail conversation on mount (within 24h, capped at 200 msgs)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      // Load assessment status to decide whether to nudge later
      supabase
        .from("user_preferences")
        .select("assessment_status")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          assessmentDoneRef.current = data?.assessment_status === "success";
        });
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

    const controller = new AbortController();
    // Safety: if the request hangs >60s, abort so loading resolves.
    const safetyTimer = setTimeout(() => controller.abort(), 60000);

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
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientNowIso: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        const errorMsg = err.error || "Something went wrong. Please try again.";
        let title = "Oops";
        if (resp.status === 429) title = "Slow down";
        else if (resp.status === 402) title = "Out of AI credits";
        else if (resp.status === 401 || resp.status === 403) title = "Please sign in again";
        else if (resp.status === 503) title = "AI service offline";
        toast({ title, description: errorMsg, variant: "destructive" });
        upsertAssistant(`⚠️ ${errorMsg}`);
        if (convIdRef.current) persistMessage(convIdRef.current, "assistant", `⚠️ ${errorMsg}`);
        setIsLoading(false);
        clearTimeout(safetyTimer);
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
    } catch (e: any) {
      if (e?.name === "AbortError") {
        const msg = "Request timed out. Please try again.";
        toast({ title: "Timed out", description: msg, variant: "destructive" });
        upsertAssistant(`⚠️ ${msg}`);
      } else {
        console.error(e);
        const msg = "Connection error. Please check your network and try again.";
        toast({ title: "Connection error", description: msg, variant: "destructive" });
        upsertAssistant(`⚠️ ${msg}`);
      }
    } finally {
      clearTimeout(safetyTimer);
    }

    // Persist assistant response
    if (convIdRef.current && assistantSoFar) {
      persistMessage(convIdRef.current, "assistant", assistantSoFar);
    }

    setIsLoading(false);

    // Assessment nudge: after ASSESSMENT_NUDGE_AT user messages, suggest personality assessment
    if (!nudgeSentRef.current && !assessmentDoneRef.current && assistantSoFar) {
      const userCount = messages.filter(m => m.role === "user").length + 1; // +1 for current
      if (userCount >= ASSESSMENT_NUDGE_AT) {
        nudgeSentRef.current = true;
        localStorage.setItem(ASSESSMENT_NUDGE_KEY, "1");
        const nudgeText = `Quick thought — now that we've been chatting a bit, I wanted to mention: I have a feature that lets me **learn your communication style and personality** so I can tailor how I respond to you specifically.\n\nIt's a short 3–5 minute assessment. If you'd like to try it, head to **Settings → Personality Syncing**. It makes a real difference in how well I can work with you.`;
        setTimeout(() => {
          setMessages(prev => [...prev, { role: "assistant", content: nudgeText }]);
        }, 1200);
      }
    }
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
            onClick={() => { setMessages([]); convIdRef.current = null; }}
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
                {new Date().getHours() < 10 ? "Start your day" : new Date().getHours() < 17 ? "Quick actions" : "Wrap up your day"}
              </p>
              {getStarterPrompts(agentName).map((item) => (
                <button
                  key={item.label}
                  onClick={() => { setInput(item.prompt); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/40 text-left text-sm text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.03] transition-all duration-200"
                >
                  <span className="text-base">{item.emoji}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
          const contextActions = isLastAssistant ? detectContextActions(msg.content) : [];

          return (
            <div key={i} style={{ animation: `fade-up 0.3s ease-out both` }}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
                        <ReactMarkdown>{stripAgentBlocks(msg.content)}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>

              {/* Context-aware action buttons after last assistant message */}
              {isLastAssistant && contextActions.length > 0 && (
                <div className="flex gap-2 mt-2 ml-1 flex-wrap">
                  {contextActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.path + action.label}
                        onClick={() => navigate(action.path)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/40 hover:bg-accent/5 transition-all"
                      >
                        <Icon className={`w-3.5 h-3.5 ${action.color}`} />
                        {action.label}
                        <ArrowRight className="w-3 h-3 opacity-40" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

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
            {(messages.length > 0 ? getFollowUpChips(messages) : getStarterPrompts(agentName)).map((item) => (
              <button
                key={item.label}
                onClick={() => { setInput(item.prompt); setTimeout(() => inputRef.current?.focus(), 50); }}
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
