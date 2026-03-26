import { useState } from "react";
import { OrchestratorChat } from "@/components/OrchestratorChat";
import { AgentSettings } from "@/components/AgentSettings";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { useAgent } from "@/contexts/AgentContext";
import { Settings, Plug, X } from "lucide-react";

const Index = () => {
  const [panel, setPanel] = useState<"settings" | "integrations" | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal top bar */}
        <header className="flex items-center justify-end px-4 md:px-6 py-2.5">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPanel(panel === "integrations" ? null : "integrations")}
              className={`p-2 rounded-lg transition-colors ${panel === "integrations" ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"}`}
              title="Integrations"
            >
              <Plug className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPanel(panel === "settings" ? null : "settings")}
              className={`p-2 rounded-lg transition-colors ${panel === "settings" ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <OrchestratorChat />
        </div>
      </div>

      {/* Side panel */}
      {panel && (
        <>
          <div
            className="fixed inset-0 bg-foreground/5 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setPanel(null)}
          />
          <div className="fixed lg:static inset-y-0 right-0 z-40 w-full max-w-sm lg:w-80 bg-card border-l border-border overflow-y-auto animate-slide-in-right">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-display text-base text-foreground">
                {panel === "settings" ? "Settings" : "Integrations"}
              </h2>
              <button
                onClick={() => setPanel(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
