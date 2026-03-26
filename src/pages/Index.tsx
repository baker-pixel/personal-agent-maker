import { useState } from "react";
import { OrchestratorChat } from "@/components/OrchestratorChat";
import { AgentSettings } from "@/components/AgentSettings";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { useAgent } from "@/contexts/AgentContext";
import { Settings, Plug, Zap, X } from "lucide-react";

const Index = () => {
  const [panel, setPanel] = useState<"settings" | "integrations" | null>(null);
  const { agentName } = useAgent();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-base text-foreground leading-tight">{agentName}</h1>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] text-muted-foreground">Active</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPanel(panel === "integrations" ? null : "integrations")}
              className={`p-2 rounded-xl transition-colors ${panel === "integrations" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title="Integrations"
            >
              <Plug className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPanel(panel === "settings" ? null : "settings")}
              className={`p-2 rounded-xl transition-colors ${panel === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat */}
        <div className="flex-1 overflow-hidden p-2 md:p-4">
          <OrchestratorChat />
        </div>
      </div>

      {/* Side panel for settings/integrations */}
      {panel && (
        <>
          <div
            className="fixed inset-0 bg-foreground/10 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setPanel(null)}
          />
          <div className="fixed lg:static inset-y-0 right-0 z-40 w-full max-w-md lg:w-96 bg-card border-l border-border overflow-y-auto animate-slide-in-right">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-display text-lg text-foreground">
                {panel === "settings" ? "Settings" : "Integrations"}
              </h2>
              <button
                onClick={() => setPanel(null)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {panel === "settings" ? <AgentSettings /> : <IntegrationsSetup />}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Index;
