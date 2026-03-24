import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import {
  Check,
  X,
  Mail,
  Calendar,
  Bell,
  FileText,
  ListChecks,
  Clock,
  Reply,
  ArrowRightLeft,
  Eye,
  Plug,
} from "lucide-react";

interface ApprovalItem {
  id: string;
  type: "email" | "calendar" | "reminder" | "document" | "task";
  title: string;
  description: string;
  time: string;
  priority: "high" | "medium" | "low";
  source?: string;
  detail?: string;
  actions?: { label: string; icon: React.ElementType }[];
}

const baseItems: ApprovalItem[] = [
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

const emailTriageItems: ApprovalItem[] = [
  {
    id: "e1",
    type: "email",
    title: "Urgent: Contract revision from legal",
    description: "From: legal@acmepartners.com — Revised terms attached. Key changes: liability cap reduced to $500K, indemnification clause updated.",
    time: "5 min ago",
    priority: "high",
    source: "Gmail",
    detail: "Drafted acknowledgment reply + flagged 2 clauses for your review",
    actions: [
      { label: "View Draft", icon: Eye },
      { label: "Reply", icon: Reply },
    ],
  },
  {
    id: "e2",
    type: "email",
    title: "Newsletter roundup — auto-archive suggested",
    description: "12 newsletters received today. 3 flagged as potentially relevant (TechCrunch, a]16z, industry digest). Rest recommended for archive.",
    time: "20 min ago",
    priority: "low",
    source: "Gmail",
    detail: "Auto-archive 9 low-priority, keep 3 flagged in inbox",
  },
  {
    id: "e3",
    type: "email",
    title: "Reply drafted: Meeting request from David Park",
    description: "David Park wants to schedule a product demo next week. Suggested Tuesday 2pm based on your availability.",
    time: "45 min ago",
    priority: "medium",
    source: "Gmail",
    detail: "Draft includes calendar link and agenda outline",
    actions: [
      { label: "View Draft", icon: Eye },
      { label: "Edit & Send", icon: Reply },
    ],
  },
];

const calendarItems: ApprovalItem[] = [
  {
    id: "c1",
    type: "calendar",
    title: "Double-booking detected: Wed 2–3pm",
    description: "Team sync overlaps with client call. Suggested: move team sync to Wed 4pm (all 4 participants available).",
    time: "10 min ago",
    priority: "high",
    source: "Google Calendar",
    detail: "Will send reschedule to team sync attendees upon approval",
    actions: [
      { label: "Accept Move", icon: ArrowRightLeft },
    ],
  },
  {
    id: "c2",
    type: "calendar",
    title: "Focus block: Thursday morning protected",
    description: "2 meeting requests received for Thu 9–11am. Your focus time is protected. Both declined with suggested alternatives.",
    time: "1 hr ago",
    priority: "medium",
    source: "Google Calendar",
    detail: "Alternative times offered: Thu 1pm and Fri 10am",
  },
  {
    id: "c3",
    type: "calendar",
    title: "Meeting brief prepared: Investor update",
    description: "Tomorrow 11am with Sequoia team. Brief includes: portfolio KPIs, burn rate update, hiring pipeline status.",
    time: "2 hrs ago",
    priority: "medium",
    source: "Google Calendar",
    detail: "3-page brief attached with talking points",
    actions: [
      { label: "View Brief", icon: Eye },
    ],
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
  const { isConnected } = useIntegrations();

  const gmailConnected = isConnected("gmail");
  const calendarConnected = isConnected("google-calendar");

  const allItems = [
    ...baseItems,
    ...(gmailConnected ? emailTriageItems : []),
    ...(calendarConnected ? calendarItems : []),
  ];

  const [items, setItems] = useState(allItems);
  // Re-sync when integrations change
  const [prevKey, setPrevKey] = useState(`${gmailConnected}-${calendarConnected}`);
  const currentKey = `${gmailConnected}-${calendarConnected}`;
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setItems([
      ...baseItems,
      ...(gmailConnected ? emailTriageItems : []),
      ...(calendarConnected ? calendarItems : []),
    ]);
  }

  const handleApprove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleReject = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const hasIntegrations = gmailConnected || calendarConnected;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Approval Inbox</h1>
        <p className="text-muted-foreground">
          {agentName} prepared {items.length} action{items.length !== 1 ? "s" : ""} for your review.
        </p>
      </div>

      {/* Integration hint */}
      {!hasIntegrations && (
        <div
          className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3"
          style={{ animation: "fade-up 0.3s ease-out both" }}
        >
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Plug className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Connect your email & calendar</p>
            <p className="text-xs text-muted-foreground">
              Go to Integrations to let {agentName} triage your inbox and manage your schedule.
            </p>
          </div>
        </div>
      )}

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
                style={{ animation: `fade-up 0.4s ease-out ${index * 0.06}s both` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    item.source ? "bg-accent/10" : "bg-muted"
                  }`}>
                    <Icon className={`w-5 h-5 ${item.source ? "text-accent" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-foreground text-sm">
                        {item.title}
                      </h3>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${priorityStyles[item.priority]}`}>
                        {item.priority}
                      </span>
                      {item.source && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">
                          {item.source}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{item.description}</p>

                    {/* Detail line for integration items */}
                    {item.detail && (
                      <p className="text-xs text-foreground/70 bg-muted/50 rounded-lg px-3 py-2 mb-3">
                        💡 {item.detail}
                      </p>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.time}
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        {/* Extra actions for integration items */}
                        {item.actions?.map((action) => {
                          const ActionIcon = action.icon;
                          return (
                            <button
                              key={action.label}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-info/10 text-info hover:bg-info/20 transition-colors"
                            >
                              <ActionIcon className="w-3.5 h-3.5" />
                              {action.label}
                            </button>
                          );
                        })}
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
