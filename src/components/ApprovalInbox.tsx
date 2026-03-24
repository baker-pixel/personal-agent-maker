import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import {
  Check,
  X,
  Mail,
  Calendar,
  Bell,
  FileText,
  ListChecks,
  Clock,
} from "lucide-react";

interface ApprovalItem {
  id: string;
  type: "email" | "calendar" | "reminder" | "document" | "task";
  title: string;
  description: string;
  time: string;
  priority: "high" | "medium" | "low";
}

const mockItems: ApprovalItem[] = [
  {
    id: "1",
    type: "email",
    title: "Draft reply to Marcus Chen",
    description: "Re: Q3 partnership proposal — suggested accepting terms with minor revision on timeline.",
    time: "2 min ago",
    priority: "high",
  },
  {
    id: "2",
    type: "calendar",
    title: "Reschedule Thursday standup",
    description: "Conflict detected with investor call. Proposed move to Friday 10am.",
    time: "15 min ago",
    priority: "medium",
  },
  {
    id: "3",
    type: "reminder",
    title: "Follow up with Sarah on contract",
    description: "No response in 3 days. Suggested follow-up drafted.",
    time: "1 hr ago",
    priority: "high",
  },
  {
    id: "4",
    type: "document",
    title: "Board deck draft ready",
    description: "Q3 performance summary compiled from project data. Review before sending.",
    time: "2 hrs ago",
    priority: "medium",
  },
  {
    id: "5",
    type: "task",
    title: "Vendor onboarding checklist",
    description: "3 of 7 items completed. Next: NDA signature and compliance review.",
    time: "3 hrs ago",
    priority: "low",
  },
];

const typeIcons: Record<ApprovalItem["type"], React.ElementType> = {
  email: Mail,
  calendar: Calendar,
  reminder: Bell,
  document: FileText,
  task: ListChecks,
};

const priorityStyles: Record<ApprovalItem["priority"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

export const ApprovalInbox = () => {
  const { agentName } = useAgent();
  const [items, setItems] = useState(mockItems);

  const handleApprove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleReject = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Approval Inbox</h1>
        <p className="text-muted-foreground">
          {agentName} prepared {items.length} action{items.length !== 1 ? "s" : ""} for your review.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h2 className="font-display text-xl text-foreground mb-2">All clear</h2>
          <p className="text-muted-foreground">No pending actions. {agentName} is watching.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const Icon = typeIcons[item.type];
            return (
              <div
                key={item.id}
                className="glass-card rounded-2xl p-5 hover:approval-glow transition-all duration-300"
                style={{ animation: `fade-up 0.4s ease-out ${index * 0.08}s both` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground text-sm truncate">
                        {item.title}
                      </h3>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${priorityStyles[item.priority]}`}>
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.time}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
