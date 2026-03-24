import React, { createContext, useContext, useState, useCallback } from "react";

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

  const setAgentName = useCallback((name: string) => {
    setAgentNameState(name);
    localStorage.setItem("agent-name", name);
  }, []);

  return (
    <AgentContext.Provider value={{ agentName, setAgentName }}>
      {children}
    </AgentContext.Provider>
  );
};
