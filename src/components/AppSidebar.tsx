import { useAgent } from "@/contexts/AgentContext";
import {
  Inbox,
  FolderKanban,
  Shield,
  Settings,
  Zap,
  MessageSquare,
  Plug,
  Sun,
  MailSearch,
  Clock,
  CalendarClock,
  LayoutList,
  Users,
  Plane,
  Gavel,
  FileBarChart,
  CalendarSearch,
  FileText,
} from "lucide-react";

type View = "briefing" | "agenda" | "triage" | "followups" | "meetings" | "inbox" | "contacts" | "projects" | "delegation" | "travel" | "decisions" | "weekly" | "scheduling" | "summarizer" | "chat" | "integrations" | "settings";

interface AppSidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "briefing", label: "Morning Briefing", icon: Sun },
  { id: "agenda", label: "Daily Agenda", icon: LayoutList },
  { id: "triage", label: "Email Triage", icon: MailSearch },
  { id: "followups", label: "Follow-Ups", icon: Clock },
  { id: "meetings", label: "Meeting Prep", icon: CalendarClock },
  { id: "scheduling", label: "Smart Scheduling", icon: CalendarSearch },
  { id: "inbox", label: "Approval Inbox", icon: Inbox },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "delegation", label: "Delegation", icon: Shield },
  { id: "decisions", label: "Decision Log", icon: Gavel },
  { id: "travel", label: "Travel & Expenses", icon: Plane },
  { id: "weekly", label: "Weekly Report", icon: FileBarChart },
  { id: "summarizer", label: "Doc Summarizer", icon: FileText },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "settings", label: "Settings", icon: Settings },
];

export const AppSidebar = ({ currentView, onNavigate }: AppSidebarProps) => {
  const { agentName } = useAgent();

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-lg text-sidebar-foreground">{agentName}</h1>
            <p className="text-xs text-sidebar-foreground/60">Executive Assistant</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              currentView === id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === "inbox" && (
              <span className="ml-auto bg-sidebar-primary text-sidebar-primary-foreground text-xs px-2 py-0.5 rounded-full font-semibold">
                5
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-soft" />
          Agent Active
        </div>
      </div>
    </div>
  );
};
