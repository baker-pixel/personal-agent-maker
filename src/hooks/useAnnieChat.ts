import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export function useAnnieChat(agentName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || thinking) return;

      const userMsg: ChatMessage = { role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);

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
        // Get auth token so the edge function can access real user data
        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };

        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

        const controller = new AbortController();
        abortRef.current = controller;

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ messages: apiMessages, agentName }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          const errorMsg = err.error || "Something went wrong. Please try again.";
          toast({ title: "Oops", description: errorMsg, variant: "destructive" });
          upsertAssistant(`⚠️ ${errorMsg}`);
          setThinking(false);
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
    [messages, thinking, agentName]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setThinking(false);
  }, []);

  return { messages, thinking, send, reset };
}
