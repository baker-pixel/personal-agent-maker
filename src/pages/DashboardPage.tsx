import { useNavigate } from "react-router-dom";
import { MessageSquare, Mic } from "lucide-react";

import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { NotConnectedState } from "@/components/NotConnectedState";
import TasksWidget from "@/components/dashboard/TasksWidget";
import EmailSummaryWidget from "@/components/dashboard/EmailSummaryWidget";
import { UpcomingWidget } from "@/components/dashboard/UpcomingWidget";
import { TodayCommandCenter } from "@/components/dashboard/TodayCommandCenter";
import { FollowUpSection } from "@/components/dashboard/FollowUpSection";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const { isConnected, integrationsLoading } = useIntegrations();
  const gmailConnected = isConnected("gmail");

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      {!integrationsLoading && !gmailConnected && (
        <NotConnectedState integration="both" variant="inline" agentName={agentName} />
      )}

      <div className="container pb-8 sm:pb-12 max-w-2xl px-4 space-y-5 pt-8">

        {/* Greeting */}
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            {getGreeting()} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {gmailConnected
              ? `${agentName} is monitoring your inbox, calendar, and tasks.`
              : `Connect Gmail to let ${agentName} get to work.`}
          </p>
        </div>

        {/* Today's Command Center */}
        <ErrorBoundary variant="widget"><TodayCommandCenter /></ErrorBoundary>

        {/* Talk to agent */}
        <div className="rounded-2xl border-2 border-accent bg-card p-5 shadow-sm shadow-accent/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-foreground leading-tight">
                Talk to {agentName}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Delegate tasks, get decisions, move fast.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/decision/text")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              <MessageSquare className="w-4 h-4" />
              Text
            </button>
            <button
              onClick={() => navigate("/decision/voice")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
            >
              <Mic className="w-4 h-4" />
              Voice
            </button>
          </div>
        </div>

        {/* At-a-glance widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <ErrorBoundary variant="widget"><EmailSummaryWidget /></ErrorBoundary>
          <ErrorBoundary variant="widget"><TasksWidget /></ErrorBoundary>
        </div>

        {/* Follow-up tracker — emails awaiting response */}
        <ErrorBoundary variant="widget"><FollowUpSection /></ErrorBoundary>

        {/* Upcoming tasks + reminders */}
        <ErrorBoundary variant="widget">
          <UpcomingWidget
            onNavigateToTasks={() => navigate("/tasks")}
            onNavigateToReminders={() => navigate("/contacts")}
          />
        </ErrorBoundary>

      </div>
    </div>
  );
}
