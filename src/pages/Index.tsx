import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ApprovalInbox } from "@/components/ApprovalInbox";
import { ProjectsDashboard } from "@/components/ProjectsDashboard";
import { AgentSettings } from "@/components/AgentSettings";
import { DelegationPanel } from "@/components/DelegationPanel";
import { AgentChat } from "@/components/AgentChat";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { MorningBriefing } from "@/components/MorningBriefing";
import { useAgent } from "@/contexts/AgentContext";
import { Menu } from "lucide-react";

type View = "briefing" | "inbox" | "projects" | "delegation" | "chat" | "integrations" | "settings";

const Index = () => {
  const [currentView, setCurrentView] = useState<View>("briefing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { agentName } = useAgent();

  const renderView = () => {
    switch (currentView) {
      case "briefing":
        return <MorningBriefing />;
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

export default Index;
