import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppState } from "@/contexts/AppStateContext";

interface AgentContextType {
  agentName: string;
  setAgentName: (name: string) => void;
}

const AgentContext = createContext<AgentContextType>({
  agentName: "Normy Agent",
  setAgentName: () => {},
});

export const useAgent = () => useContext(AgentContext);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { state } = useAppState();
  const [agentName, setAgentNameState] = useState<string>(
    () => localStorage.getItem("agent-name") ?? "Normy Agent"
  );

  // Sync agent name when profile loads from the machine.
  // No auth subscription needed — machine owns auth lifecycle.
  useEffect(() => {
    const name = state.profile?.agentName;
    if (name && name !== agentName) {
      setAgentNameState(name);
      localStorage.setItem("agent-name", name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profile?.agentName]);

  const setAgentName = useCallback(async (name: string) => {
    setAgentNameState(name);
    localStorage.setItem("agent-name", name);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        agent_name: name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }, []);

  return (
    <AgentContext.Provider value={{ agentName, setAgentName }}>
      {children}
    </AgentContext.Provider>
  );
};
