import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/components/OrchestratorChat";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("chat_conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) setConversations(data);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "");
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: session.user.id, title })
      .select("id")
      .single();
    if (error || !data) return null;
    setActiveId(data.id);
    fetchConversations();
    return data.id;
  }, [fetchConversations]);

  const loadMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
    setIsLoading(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content, attachments")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setIsLoading(false);
    if (!data) return [];
    return data.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, attachments: m.attachments as any[] | undefined }));
  }, []);

  const saveMessage = useCallback(async (conversationId: string, msg: Message & { attachments?: any[] }) => {
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments || [],
    });
    await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("chat_conversations").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    fetchConversations();
  }, [activeId, fetchConversations]);

  const startNew = useCallback(() => {
    setActiveId(null);
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    isLoading,
    createConversation,
    loadMessages,
    saveMessage,
    deleteConversation,
    startNew,
    fetchConversations,
  };
}
