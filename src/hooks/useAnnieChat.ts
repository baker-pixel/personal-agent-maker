import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { markStage, setTurnConversationId } from "@/lib/voiceLatency";

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export interface DelegateConversation {
  id: string;
  title: string;
  updated_at: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

async function persistMessage(conversationId: string, role: string, content: string) {
  await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    role,
    content,
  });
  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export function useAnnieChat(
  agentName: string,
  mode: "text" | "voice" = "text",
  options?: { conversationTitle?: string; enabled?: boolean; skipInitialLoad?: boolean }
) {
  const conversationTitle = options?.conversationTitle ?? "Delegate";
  const enabled = options?.enabled ?? true;
  const skipInitialLoad = options?.skipInitialLoad ?? false;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<DelegateConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convIdRef = useRef<string | null>(null);

  const fetchConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from("chat_conversations")
      .select("id, title, updated_at")
      .eq("user_id", session.user.id)
      .eq("title", conversationTitle)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) setConversations(data);
  }, [conversationTitle]);

  const loadConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    convIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    // Cap at last 200 messages to avoid huge payloads on long conversations
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (msgs && msgs.length > 0) {
      const ordered = [...msgs].reverse();
      setMessages(
        ordered.map((m) => ({
          role: m.role === "user" ? "user" as const : "agent" as const,
          text: m.content,
        }))
      );
    } else {
      setMessages([]);
    }
    setLoading(false);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("chat_conversations").delete().eq("id", id);
    if (convIdRef.current === id) {
      convIdRef.current = null;
      setActiveConversationId(null);
      setMessages([]);
    }
    fetchConversations();
  }, [fetchConversations]);

  // Load most recent conversation on mount (skipped until enabled, or if skipInitialLoad)
  useEffect(() => {
    if (!enabled || skipInitialLoad) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) { setLoading(false); return; }

      await fetchConversations();

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("title", conversationTitle)
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0 && !cancelled) {
        const convId = existing[0].id;
        convIdRef.current = convId;
        setActiveConversationId(convId);

        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(200);

        if (msgs && msgs.length > 0 && !cancelled) {
          const ordered = [...msgs].reverse();
          setMessages(
            ordered.map((m) => ({
              role: m.role === "user" ? "user" as const : "agent" as const,
              text: m.content,
            }))
          );
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled, skipInitialLoad, conversationTitle, fetchConversations]);

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || thinking) return;

      const userMsg: ChatMessage = { role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);

      // Single getSession call for the whole send flow
      const { data: { session } } = await supabase.auth.getSession();

      // Create conversation if needed
      if (!convIdRef.current) {
        if (session?.user) {
          const { data: created } = await supabase
            .from("chat_conversations")
            .insert({ user_id: session.user.id, title: conversationTitle })
            .select("id")
            .single();
          if (created) {
            convIdRef.current = created.id;
            setActiveConversationId(created.id);
            fetchConversations();
          }
        }
      }

      // Persist user message
      if (convIdRef.current) {
        persistMessage(convIdRef.current, "user", trimmed);
      }

      let assistantSoFar = "";

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "agent") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, text: assistantSoFar } : m
            );
          }
          return [...prev, { role: "agent", text: assistantSoFar }];
        });
      };

      try {
        const authHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };

        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

        if (convIdRef.current) setTurnConversationId(convIdRef.current);
        markStage("llm_start");

        const controller = new AbortController();
        abortRef.current = controller;
        // Safety: if the request hangs >60s, abort so 'thinking' resolves.
        const safetyTimer = setTimeout(() => controller.abort(), 60000);

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            messages: apiMessages,
            agentName,
            mode,
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientNowIso: new Date().toISOString(),
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(safetyTimer));

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
          setThinking(false);
          return;
        }

        if (!resp.body) throw new Error("No response body");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let firstToken = true;

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
              if (content) {
                if (firstToken) { markStage("llm_first_token"); firstToken = false; }
                upsertAssistant(content);
              }
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }

        // Persist assistant response
        if (convIdRef.current && assistantSoFar) {
          persistMessage(convIdRef.current, "assistant", assistantSoFar);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Agent chat error:", err);
        const errorMsg = err?.message || "Something went wrong. Try again!";
        toast({ title: "Oops", description: errorMsg, variant: "destructive" });
        upsertAssistant("Sorry, I had trouble connecting. Try again?");
      } finally {
        abortRef.current = null;
        setThinking(false);
      }
    },
    [messages, thinking, agentName, fetchConversations]
  );

  const reset = useCallback(async () => {
    abortRef.current?.abort();
    setMessages([]);
    setThinking(false);
    convIdRef.current = null;
    setActiveConversationId(null);
  }, []);

  const injectAgentMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "agent", text }]);
    if (convIdRef.current) persistMessage(convIdRef.current, "assistant", text);
  }, []);

  return {
    messages,
    thinking,
    loading,
    send,
    reset,
    injectAgentMessage,
    conversations,
    activeConversationId,
    loadConversation,
    deleteConversation,
    fetchConversations,
  };
}
