import { useState, useRef, useEffect, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, Mic, MicOff, Sun, MailSearch, Clock, CalendarClock, FileText, Users, FileBarChart, CalendarSearch, PenLine, AlertTriangle, BellRing, CalendarCheck, Shield } from "lucide-react";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatHero } from "./chat/ChatHero";
import { QuickActionGrid } from "./chat/QuickActionGrid";
import { QuickActionPills } from "./chat/QuickActionPills";
import { DashboardBriefing } from "./chat/DashboardBriefing";
import { FileAttachmentButton, AttachmentPreview, type Attachment } from "./chat/FileAttachment";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { Conversation } from "@/hooks/useConversations";

export type Message = { role: "user" | "assistant"; content: string; attachments?: any[] };

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
  { label: "Auto-Draft Replies", prompt: "Auto-draft replies for all my emails that need a response. Generate context-aware, professional drafts I can review and approve.", icon: PenLine, color: "text-success" },
  { label: "Follow-Ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply? Draft polite follow-up messages for the overdue ones.", icon: Clock, color: "text-primary" },
  { label: "Meeting Prep", prompt: "Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.", icon: CalendarClock, color: "text-info" },
  { label: "Calendar Conflicts", prompt: "Check my calendar for the next 7 days. Flag any double-bookings or conflicts. For each conflict, suggest which to reschedule and draft a message to the attendees.", icon: AlertTriangle, color: "text-destructive" },
  { label: "Find Free Time", prompt: "Show me my availability for the next 5 business days. Find the best open slots for a 30-minute meeting, considering buffer times and meeting density.", icon: CalendarSearch, color: "text-accent" },
  { label: "Schedule Link", prompt: "Generate a shareable summary of my availability for the next week so I can send it to someone who wants to book time with me.", icon: CalendarCheck, color: "text-info" },
  { label: "Snooze Email", prompt: "I want to snooze an email to be reminded about it later. Which email should I snooze and when should I be reminded?", icon: BellRing, color: "text-warning" },
  { label: "Weekly Report", prompt: "Generate my weekly report. Summarize accomplishments, in-progress items, things needing attention, and next week's priorities.", icon: FileBarChart, color: "text-primary" },
  { label: "Summarize Doc", prompt: "I need to summarize a document. I'll paste the text — give me an executive summary with key takeaways and action items.", icon: FileText, color: "text-muted-foreground" },
  { label: "Contact Lookup", prompt: "Help me look up a contact. I'll give you a name — pull together what you know about our interaction history and open threads.", icon: Users, color: "text-info" },
];

interface OrchestratorChatProps {
  conversationId: string | null;
  onConversationCreated: (firstMessage: string) => Promise<string | null>;
  onSaveMessage: (convId: string, msg: Message) => Promise<void>;
  loadMessages: (convId: string) => Promise<Message[]>;
  onSendMessageRef?: React.MutableRefObject<((msg: string) => void) | undefined>;
}

export const OrchestratorChat = ({ conversationId, onConversationCreated, onSaveMessage, loadMessages, onSendMessageRef }: OrchestratorChatProps) => {
  const { agentName } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(conversationId);

  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId).then(setMessages);
    } else {
      setMessages([]);
    }
  }, [conversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
    inputRef.current?.focus();
  }, []);

  const { isListening, isSupported: voiceSupported, startListening, stopListening } = useVoiceInput(handleVoiceResult);

  const uploadAttachments = async (files: Attachment[]): Promise<any[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || files.length === 0) return [];
    const uploaded: any[] = [];
    for (const att of files) {
      const ext = att.file.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, att.file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path);
        uploaded.push({ name: att.file.name, type: att.file.type, url: publicUrl });
      }
    }
    return uploaded;
  };

  const handleAddFiles = (files: FileList) => {
    const newAtts: Attachment[] = Array.from(files).map((file) => {
      const att: Attachment = { file };
      if (file.type.startsWith("image/")) {
        att.preview = URL.createObjectURL(file);
      }
      return att;
    });
    setAttachments((prev) => [...prev, ...newAtts]);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };




  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;

    const uploadedFiles = await uploadAttachments(attachments);
    const userMsg: Message = { role: "user", content: text, attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined };

    if (!overrideText) setInput("");
    setAttachments([]);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let currentConvId = convIdRef.current;
    if (!currentConvId) {
      currentConvId = await onConversationCreated(text);
      if (currentConvId) convIdRef.current = currentConvId;
    }

    if (currentConvId) {
      await onSaveMessage(currentConvId, userMsg);
    }

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

      const messagesPayload = [...messages, userMsg].map((m) => {
        let content = m.content;
        if (m.attachments?.length) {
          content += "\n\n[Attached files: " + m.attachments.map((a: any) => `${a.name} (${a.type})`).join(", ") + "]";
        }
        return { role: m.role, content };
      });

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: messagesPayload,
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

    if (currentConvId && assistantSoFar) {
      await onSaveMessage(currentConvId, { role: "assistant", content: assistantSoFar });
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Expose send function for external triggers (e.g. notifications)
  useEffect(() => {
    if (onSendMessageRef) {
      onSendMessageRef.current = (msg: string) => handleSend(msg);
    }
  });


  const handleQuickAction = (action: QuickAction) => {
    handleSend(action.prompt);
  };

  const handleRegenerate = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const userMsg = messages[i].content;
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          return prev[lastIdx]?.role === "assistant" ? prev.slice(0, lastIdx) : prev;
        });
        setTimeout(() => handleSend(userMsg), 50);
        break;
      }
    }
  }, [messages, handleSend]);

  const handleEditResend = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        setInput(messages[i].content);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const endIdx = prev[lastIdx]?.role === "assistant" ? i : i;
          return prev.slice(0, endIdx);
        });
        inputRef.current?.focus();
        break;
      }
    }
  }, [messages]);

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 md:px-6 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="py-8 space-y-8">
            <ChatHero agentName={agentName} />
            <DashboardBriefing onAskAssistant={handleSend} />
            <div className="pt-4">
              <p className="text-[10px] font-semibold text-muted-foreground/30 uppercase tracking-widest text-center mb-4">Quick Actions</p>
              <QuickActionGrid actions={quickActions} onAction={handleQuickAction} />
            </div>
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onSend={handleSend}
            onRegenerate={handleRegenerate}
            onEditResend={handleEditResend}
          />
        )}
      </div>

      {/* Quick action pills when in conversation */}
      {messages.length > 0 && !isLoading && (
        <QuickActionPills actions={quickActions.slice(0, 4)} onAction={handleQuickAction} />
      )}

      {/* Input bar */}
      <div className="px-3 md:px-6 pb-5 pt-2">
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm input-glow transition-all duration-300">
          <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />
          <div className="flex items-end gap-1 p-2">
            <FileAttachmentButton onAdd={handleAddFiles} />
            {voiceSupported && (
              <button
                onClick={isListening ? stopListening : startListening}
                className={`shrink-0 p-2.5 rounded-xl transition-all duration-200 ${
                  isListening
                    ? "text-destructive bg-destructive/10 animate-pulse"
                    : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40"
                }`}
                title={isListening ? "Stop listening" : "Voice input"}
                type="button"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentName}…`}
              rows={1}
              className="flex-1 bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none max-h-32"
              style={{ minHeight: "44px" }}
            />
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="shrink-0 px-3 py-2.5 rounded-xl text-[11px] font-medium text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-all duration-200"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/30 mt-2">
          Normy can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
};
