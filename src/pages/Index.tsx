import { useState, useCallback, useRef } from "react";
import { OrchestratorChat } from "@/components/OrchestratorChat";
import { AgentSettings } from "@/components/AgentSettings";
import { IntegrationsSetup } from "@/components/IntegrationsSetup";
import { ApprovalInbox } from "@/components/ApprovalInbox";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useConversations } from "@/hooks/useConversations";
import { Settings, Plug, X, ArrowLeft, LogOut, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [panel, setPanel] = useState<"settings" | "integrations" | "inbox" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sendMessageRef = useRef<(msg: string) => void>();
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

  const handleNotificationAction = useCallback((message: string) => {
    sendMessageRef.current?.(message);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Conversation sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 mesh-bg">
        {/* Minimal top bar */}
        <header className="flex items-center justify-between px-4 md:px-6 py-2.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 lg:hidden"
            title="Conversations"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            <NotificationCenter onSendMessage={handleNotificationAction} />
            <button
              onClick={() => setPanel(panel === "inbox" ? null : "inbox")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${panel === "inbox" ? "bg-accent/10 text-accent" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50"}`}
              title="Approval Inbox"
            >
              <Inbox className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPanel(panel === "integrations" ? null : "integrations")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${panel === "integrations" ? "bg-accent/10 text-accent" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50"}`}
              title="Integrations"
            >
              <Plug className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPanel(panel === "settings" ? null : "settings")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${panel === "settings" ? "bg-accent/10 text-accent" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50"}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2.5 rounded-xl text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <OrchestratorChat
            conversationId={activeId}
            onConversationCreated={createConversation}
            onSaveMessage={saveMessage}
            loadMessages={loadMessages}
            onSendMessageRef={sendMessageRef}
          />
        </div>
      </div>

      {/* Side panel */}
      {panel && (
        <>
          <div
            className="fixed inset-0 bg-foreground/5 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setPanel(null)}
          />
          <div className="fixed lg:static inset-y-0 right-0 z-40 w-full max-w-sm lg:w-80 bg-card border-l border-border/50 overflow-y-auto animate-slide-in-right shadow-elevated">
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <h2 className="font-display text-base text-foreground">
                {panel === "settings" ? "Settings" : panel === "inbox" ? "Approval Inbox" : "Integrations"}
              </h2>
              <button
                onClick={() => setPanel(null)}
                className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={panel === "inbox" ? "" : "p-5"}>
              {panel === "settings" ? <AgentSettings /> : panel === "inbox" ? <ApprovalInbox /> : <IntegrationsSetup />}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Index;
