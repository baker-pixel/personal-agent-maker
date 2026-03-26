import { MessageSquare, Plus, Trash2, Sparkles } from "lucide-react";
import type { Conversation } from "@/hooks/useConversations";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const ConversationSidebar = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
}: ConversationSidebarProps) => (
  <>
    {/* Mobile overlay */}
    {isOpen && (
      <div
        className="fixed inset-0 bg-foreground/10 backdrop-blur-sm z-30 lg:hidden"
        onClick={onClose}
      />
    )}
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-sidebar flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      {/* Brand header */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl bg-sidebar-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-sidebar-primary" />
          </div>
          <span className="font-display text-base text-sidebar-foreground tracking-tight">Normy</span>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-accent-foreground text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New conversation
        </button>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-sidebar-border" />

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-thin">
        {conversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MessageSquare className="w-5 h-5 text-sidebar-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-sidebar-foreground/30">No conversations yet</p>
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                activeId === c.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/80"
              }`}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <span className="text-[13px] font-medium truncate flex-1">{c.title}</span>
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
          ))
        )}
      </div>
    </aside>
  </>
);
