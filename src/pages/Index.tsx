import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ApprovalInbox } from "@/components/ApprovalInbox";
import { ProjectsDashboard } from "@/components/ProjectsDashboard";
import { AgentSettings } from "@/components/AgentSettings";
import { DelegationPanel } from "@/components/DelegationPanel";
import { AgentChat } from "@/components/AgentChat";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { MorningBriefing } from "@/components/MorningBriefing";
import { EmailTriage } from "@/components/EmailTriage";
import { FollowUpTracker } from "@/components/FollowUpTracker";
import { useAgent } from "@/contexts/AgentContext";
import { Menu } from "lucide-react";

type View = "briefing" | "triage" | "followups" | "inbox" | "projects" | "delegation" | "chat" | "integrations" | "settings";

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("briefing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { agentName } = useAgent();

  const renderView = () => {
    switch (currentView) {
      case "briefing":
        return <MorningBriefing />;
      case "triage":
        return <EmailTriage />;
      case "followups":
        return <FollowUpTracker />;
      case "inbox":
        return <ApprovalInbox />;
      case "projects":
        return <ProjectsDashboard />;
      case "delegation":
        return <DelegationPanel />;
      case "chat":
        return <AgentChat />;
      case "integrations":
        return <IntegrationsSetup />;
      case "settings":
        return <AgentSettings />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <AppSidebar
          currentView={currentView}
          onNavigate={(view) => {
            setCurrentView(view);
            setSidebarOpen(false);
          }}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="font-display text-lg text-foreground">{agentName}</h1>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderView()}
        </main>
      </div>
    </div>
  );
};

export default Index;
