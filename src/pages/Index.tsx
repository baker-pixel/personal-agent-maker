import { useState, useCallback, useRef, useEffect } from "react";
import { OrchestratorChat } from "@/components/OrchestratorChat";
import { AgentSettings } from "@/components/AgentSettings";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { ApprovalInbox } from "@/components/ApprovalInbox";
import { Dashboard } from "@/components/Dashboard";
import { ActionItems } from "@/components/ActionItems";
import { ContactReminders } from "@/components/ContactReminders";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { NewsMonitor } from "@/components/NewsMonitor";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useConversations } from "@/hooks/useConversations";
import { useDraftActions } from "@/hooks/useDraftActions";
import { Home, MessageSquare, Inbox, Plug, Settings, LogOut, ArrowLeft, ListTodo, Gift, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Tab = "home" | "chat" | "inbox" | "tasks" | "reminders" | "news" | "integrations" | "settings";

const tabs: { id: Tab; label: string; icon: React.ElementType; mobileHide?: boolean }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "reminders", label: "Reminders", icon: Gift, mobileHide: true },
  { id: "news", label: "News", icon: Newspaper, mobileHide: true },
  { id: "integrations", label: "Connect", icon: Plug, mobileHide: true },
  { id: "settings", label: "Settings", icon: Settings },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem("normy_onboarding_complete");
  });
  const sendMessageRef = useRef<(msg: string) => void>();
  const { drafts } = useDraftActions();
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    loadMessages,
    saveMessage,
    deleteConversation,
    startNew,
  } = useConversations();

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  }, [setActiveId]);

  const handleNewConversation = useCallback(() => {
    startNew();
    setSidebarOpen(false);
  }, [startNew]);

  const handleNavigateToChat = useCallback((prompt?: string) => {
    setActiveTab("chat");
    if (prompt) {
      setTimeout(() => sendMessageRef.current?.(prompt), 100);
    }
  }, []);

  const handleNotificationAction = useCallback((message: string) => {
    setActiveTab("chat");
    sendMessageRef.current?.(message);
  }, []);

  const pendingCount = drafts.length;

  const completeOnboarding = useCallback(() => {
    localStorage.setItem("normy_onboarding_complete", "true");
    setShowOnboarding(false);
  }, []);

  if (showOnboarding) {
    return <OnboardingFlow onComplete={completeOnboarding} onSkip={completeOnboarding} />;
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Conversation sidebar (only visible on chat tab) */}
      {activeTab === "chat" && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={deleteConversation}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 mesh-bg">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 md:px-6 py-2 border-b border-border/30 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {activeTab === "chat" ? (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 lg:hidden"
                title="Conversations"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : activeTab !== "home" ? (
              <button
                onClick={() => setActiveTab("home")}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                title="Back to Home"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h1 className="font-display text-sm font-semibold text-foreground hidden md:block">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop nav tabs */}
            <nav className="hidden md:flex items-center gap-0.5 mr-3">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {tab.id === "inbox" && pendingCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <NotificationCenter onSendMessage={handleNotificationAction} />
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2.5 rounded-xl text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "home" && (
            <Dashboard
              onNavigateToChat={handleNavigateToChat}
              onNavigateToInbox={() => setActiveTab("inbox")}
              onNavigateToTasks={() => setActiveTab("tasks")}
              onNavigateToReminders={() => setActiveTab("reminders")}
            />
          )}
          {activeTab === "chat" && (
            <OrchestratorChat
              conversationId={activeId}
              onConversationCreated={createConversation}
              onSaveMessage={saveMessage}
              loadMessages={loadMessages}
              onSendMessageRef={sendMessageRef}
            />
          )}
          {activeTab === "inbox" && (
            <div className="h-full overflow-y-auto py-6">
              <ApprovalInbox />
            </div>
          )}
          {activeTab === "tasks" && (
            <div className="h-full overflow-y-auto py-6 px-4 md:px-6">
              <ActionItems />
            </div>
          )}
          {activeTab === "reminders" && (
            <div className="h-full overflow-y-auto py-6 px-4 md:px-6">
              <ContactReminders />
            </div>
          )}
          {activeTab === "news" && (
            <div className="h-full overflow-y-auto py-6 px-4 md:px-6">
              <NewsMonitor onNavigateToChat={handleNavigateToChat} />
            </div>
          )}
          {activeTab === "integrations" && (
            <div className="h-full overflow-y-auto py-6 px-4 md:px-6 max-w-2xl mx-auto">
              <IntegrationsSetup />
            </div>
          )}
          {activeTab === "settings" && (
            <div className="h-full overflow-y-auto py-6 px-4 md:px-6 max-w-2xl mx-auto">
              <AgentSettings />
            </div>
          )}
        </div>

        {/* Bottom tab bar (mobile only) */}
        <nav className="md:hidden flex items-center justify-around border-t border-border/30 bg-card/80 backdrop-blur-sm px-2 py-1.5 safe-area-bottom">
          {tabs.filter((t) => !t.mobileHide).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[60px] ${
                  isActive
                    ? "text-accent"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-accent" : ""}`} />
                <span className={`text-[10px] font-medium ${isActive ? "text-accent" : ""}`}>
                  {tab.label}
                </span>
                {tab.id === "inbox" && pendingCount > 0 && (
                  <span className="absolute top-0 right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default Index;
