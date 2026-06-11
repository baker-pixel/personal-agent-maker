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
  const ensureConversationRef = useRef<Promise<string | null> | null>(null);
  // Bumped by reset() — an in-flight initial load from a previous "generation"
  // must not repopulate messages after the user started a fresh session.
  const resetGenRef = useRef(0);

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

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;
    if (ensureConversationRef.current) return ensureConversationRef.current;

    ensureConversationRef.current = (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (!session?.user) return null;

      const { data: created } = await supabase
        .from("chat_conversations")
        .insert({ user_id: session.user.id, title: conversationTitle })
        .select("id")
        .single();

      if (!created?.id) return null;
      convIdRef.current = created.id;
      setActiveConversationId(created.id);
      fetchConversations();
      return created.id;
    })();

    try {
      return await ensureConversationRef.current;
    } finally {
      ensureConversationRef.current = null;
    }
  }, [conversationTitle, fetchConversations]);

  const loadConversation = useCallback(async (conversationId: string) => {
    // Bump the generation: this load supersedes any in-flight initial load or
    // streaming turn, and a reset()/new session while our query is in flight
    // invalidates US — without this the stale result repopulated messages
    // after a fresh voice session started and the old reply got spoken aloud.
    const gen = ++resetGenRef.current;
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
    if (resetGenRef.current !== gen) return;
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
    const gen = resetGenRef.current;
    const stale = () => cancelled || resetGenRef.current !== gen;
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (!session?.user || stale()) { if (!stale()) setLoading(false); return; }

      await fetchConversations();
      if (stale()) return;

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("title", conversationTitle)
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0 && !stale()) {
        const convId = existing[0].id;
        convIdRef.current = convId;
        setActiveConversationId(convId);

        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(200);

        if (msgs && msgs.length > 0 && !stale()) {
          const ordered = [...msgs].reverse();
          setMessages(
            ordered.map((m) => ({
              role: m.role === "user" ? "user" as const : "agent" as const,
              text: m.content,
            }))
          );
        }
      }
      if (!stale()) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled, skipInitialLoad, conversationTitle, fetchConversations]);

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || thinking) return;

      // Stamp this turn: reset()/loadConversation() bump the generation, and a
      // stale turn must stop touching state — otherwise a late streaming chunk
      // re-appends a partial old reply into the NEW session's empty message
      // list and the voice loop speaks it as if it were fresh.
      const gen = resetGenRef.current;
      const stale = () => resetGenRef.current !== gen;

      const userMsg: ChatMessage = { role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);

      // Get session, refresh once if missing/expired
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (stale()) return;

      // Create conversation if needed
      if (!convIdRef.current && session?.user) await ensureConversation();

      // Persist user message
      if (convIdRef.current) {
        persistMessage(convIdRef.current, "user", trimmed);
      }

      let assistantSoFar = "";

      const upsertAssistant = (chunk: string) => {
        if (stale()) return;
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

      const controller = new AbortController();
      abortRef.current = controller;
      // timerFired distinguishes our 60s timeout from a user-initiated abort (reset())
      let timerFired = false;
      const safetyTimer = setTimeout(() => {
        timerFired = true;
        controller.abort();
      }, 60000);

      try {
        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

        const reqBody = JSON.stringify({
          messages: apiMessages,
          agentName,
          mode,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientNowIso: new Date().toISOString(),
        });

        const getToken = () =>
          session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const doFetch = () =>
          fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            body: reqBody,
            signal: controller.signal,
          });

        if (convIdRef.current) setTurnConversationId(convIdRef.current);
        markStage("llm_start");
        let resp = await doFetch();

        // Auto-refresh session on 401 and retry once. The refresh is raced
        // against a timeout: after a background suspend the auth client can
        // deadlock on its internal lock, and an unguarded await here would
        // hang forever with `thinking` stuck on.
        if (resp.status === 401) {
          try {
            const { data } = await Promise.race([
              supabase.auth.refreshSession(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("session refresh timed out")), 8000)
              ),
            ]);
            if (data.session) session = data.session;
          } catch (refreshErr) {
            console.warn("Session refresh failed:", refreshErr);
          }
          resp = await doFetch();
        }

        // Retry once on 503 — Supabase edge function cold start
        if (resp.status === 503) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 4000);
            controller.signal.addEventListener("abort", () => { clearTimeout(t); resolve(); });
          });
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          resp = await doFetch();
        }

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          const errorMsg = err.error || "Something went wrong. Please try again.";
          let title = "Oops";
          if (resp.status === 429) title = "Slow down";
          else if (resp.status === 402) title = "Out of AI credits";
          else if (resp.status === 401 || resp.status === 403) title = "Please sign in again";
          else if (resp.status === 503) title = "AI service offline";
          if (stale()) return;
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
        if (convIdRef.current && assistantSoFar && !stale()) {
          persistMessage(convIdRef.current, "assistant", assistantSoFar);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Timeout from our safetyTimer — show recoverable message so user knows to retry
          if (timerFired && !stale()) {
            const msg = "Request timed out. Please try again.";
            upsertAssistant(msg);
            if (convIdRef.current) persistMessage(convIdRef.current, "assistant", msg);
          }
          return;
        }
        console.error("Agent chat error:", err);
        const errorMsg = err instanceof Error ? err.message : "Something went wrong. Try again!";
        toast({ title: "Oops", description: errorMsg, variant: "destructive" });
        upsertAssistant("Sorry, I had trouble connecting. Try again?");
      } finally {
        clearTimeout(safetyTimer);
        abortRef.current = null;
        // Stale turn: reset() already cleared thinking, and a NEW turn may
        // have set it true — stomping it here would kill that turn's
        // thinking indicator (and mute its streaming TTS).
        if (!stale()) setThinking(false);
      }
    },
    [messages, thinking, agentName, mode, ensureConversation]
  );

  const reset = useCallback(async () => {
    resetGenRef.current += 1; // invalidate any in-flight initial load
    abortRef.current?.abort();
    setMessages([]);
    setThinking(false);
    setLoading(false);
    ensureConversationRef.current = null;
    convIdRef.current = null;
    setActiveConversationId(null);
  }, []);

  const injectAgentMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "agent", text }]);
    if (convIdRef.current) {
      void persistMessage(convIdRef.current, "assistant", text);
      return;
    }
    void ensureConversation().then((conversationId) => {
      if (conversationId) return persistMessage(conversationId, "assistant", text);
    });
  }, [ensureConversation]);

  // Voice transcripts from the speech-to-speech engine — the turn already
  // happened server-side, so this only records it (never triggers a send).
  const injectUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    if (convIdRef.current) {
      void persistMessage(convIdRef.current, "user", text);
      return;
    }
    void ensureConversation().then((conversationId) => {
      if (conversationId) return persistMessage(conversationId, "user", text);
    });
  }, [ensureConversation]);

  return {
    messages,
    thinking,
    loading,
    send,
    reset,
    injectAgentMessage,
    injectUserMessage,
    conversations,
    activeConversationId,
    loadConversation,
    deleteConversation,
    fetchConversations,
  };
}
