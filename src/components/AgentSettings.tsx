import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Zap, Check } from "lucide-react";

export const AgentSettings = () => {
  const { agentName, setAgentName } = useAgent();
  const [nameInput, setNameInput] = useState(agentName);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (nameInput.trim()) {
      setAgentName(nameInput.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">Customize your AI executive assistant.</p>
      </div>

      <div className="glass-card rounded-2xl p-6" style={{ animation: "fade-up 0.4s ease-out both" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Agent Identity</h2>
            <p className="text-xs text-muted-foreground">Give your assistant a name</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-foreground mb-2">
              Agent Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all"
              placeholder="Enter agent name..."
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!nameInput.trim() || nameInput.trim() === agentName}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
