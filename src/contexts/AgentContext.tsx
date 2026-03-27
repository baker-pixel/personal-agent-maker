import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AgentContextType {
  agentName: string;
  setAgentName: (name: string) => void;
}

const AgentContext = createContext<AgentContextType>({
  agentName: "Normy Agent",
  setAgentName: () => {},
});

export const useAgent = () => useContext(AgentContext);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agentName, setAgentNameState] = useState(() => {
    return localStorage.getItem("agent-name") || "Normy Agent";
  });

  // Load from database on mount
  useEffect(() => {
    const loadFromDb = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_preferences")
        .select("agent_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.agent_name) {
        setAgentNameState(data.agent_name);
        localStorage.setItem("agent-name", data.agent_name);
      }
    };
    loadFromDb();
  }, []);

  const setAgentName = useCallback(async (name: string) => {
    setAgentNameState(name);
    localStorage.setItem("agent-name", name);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, agent_name: name, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  }, []);

  return (
    <AgentContext.Provider value={{ agentName, setAgentName }}>
      {children}
    </AgentContext.Provider>
  );
};
