import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export function useAnnieChat(agentName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);

  const send = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || thinking) return;

      const userMsg: ChatMessage = { role: "user", text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);

      try {
        const apiMessages = [...messages, userMsg].map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

        const { data, error } = await supabase.functions.invoke("chat", {
          body: {
            messages: apiMessages,
            agentName,
          },
        });

        if (error) throw error;

        const reply = data?.reply || data?.message || "I'm here! What do you need?";
        setMessages((prev) => [...prev, { role: "agent", text: reply }]);
      } catch (err: any) {
        console.error("Agent chat error:", err);
        const errorMsg = err?.message || "Something went wrong. Try again!";
        toast({ title: "Oops", description: errorMsg, variant: "destructive" });
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: "Sorry, I had trouble connecting. Try again?" },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking, agentName]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setThinking(false);
  }, []);

  return { messages, thinking, send, reset };
}
