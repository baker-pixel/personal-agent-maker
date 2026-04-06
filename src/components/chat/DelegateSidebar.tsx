import { MessageSquare, Plus, Trash2, PanelLeftClose } from "lucide-react";
import type { DelegateConversation } from "@/hooks/useAnnieChat";

interface DelegateSidebarProps {
  conversations: DelegateConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
}

export const DelegateSidebar = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
  agentName,
}: DelegateSidebarProps) => (
  <>
    {isOpen && (
      <div
        className="fixed inset-0 bg-foreground/10 backdrop-blur-sm z-30 lg:hidden"
        onClick={onClose}
      />
    )}
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      } lg:flex hidden`}
    >
      <div className="p-4 pb-3 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-sidebar-foreground tracking-tight">
          {agentName}'s Chats
        </span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors lg:hidden"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-accent-foreground text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New conversation
        </button>
      </div>

      <div className="mx-3 border-t border-sidebar-border" />

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-thin">
        {conversations.length === 0 ? (
          <div className="text-center py-10 px-4">
            <MessageSquare className="w-5 h-5 text-sidebar-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-sidebar-foreground/30">No conversations yet</p>
          </div>
        ) : (
          conversations.map((c) => {
            const date = new Date(c.updated_at);
            const timeStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  activeId === c.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/80"
                }`}
                onClick={() => onSelect(c.id)}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium truncate block">Chat</span>
                  <span className="text-[11px] opacity-50">{timeStr}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-sidebar-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  </>
);
