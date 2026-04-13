import { useState, useEffect, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { Calendar, Mail, Clock, AlertTriangle, CheckCircle2, Loader2, Video, Users, FileText } from "lucide-react";
import { ReconnectBanner } from "@/components/ReconnectBanner";

interface AgendaItem {
  id: string;
  time: string;
  title: string;
  type: "meeting" | "followup" | "email" | "task";
  priority: "high" | "medium" | "low";
  description: string;
  attendees?: string[];
}

const mockAgenda: AgendaItem[] = [
  { id: "1", time: "8:00 AM", title: "Review urgent emails", type: "email", priority: "high", description: "3 urgent emails need responses before 9 AM" },
  { id: "2", time: "9:00 AM", title: "Standup with Engineering", type: "meeting", priority: "medium", description: "Weekly sync — discuss sprint progress", attendees: ["Sarah Chen", "Mike Ross"] },
  { id: "3", time: "10:30 AM", title: "Follow up: Partnership proposal", type: "followup", priority: "high", description: "Sent 3 days ago to Acme Corp, no reply yet" },
  { id: "4", time: "11:00 AM", title: "Board deck review", type: "task", priority: "medium", description: "Final review of Q3 board presentation slides" },
  { id: "5", time: "1:00 PM", title: "Lunch with investor", type: "meeting", priority: "high", description: "Sarah from Sequoia — Series B discussion", attendees: ["Sarah Kim"] },
  { id: "6", time: "2:30 PM", title: "Product roadmap sync", type: "meeting", priority: "medium", description: "Review feature prioritization for next quarter", attendees: ["Product Team"] },
  { id: "7", time: "4:00 PM", title: "Follow up: Contract renewal", type: "followup", priority: "low", description: "Sent last week to legal team" },
  { id: "8", time: "5:00 PM", title: "End-of-day summary", type: "task", priority: "low", description: "Review completed items and prep tomorrow's agenda" },
];

const typeIcons: Record<string, React.ElementType> = {
  meeting: Video,
  followup: Clock,
  email: Mail,
  task: CheckCircle2,
};

const typeColors: Record<string, string> = {
  meeting: "bg-primary/10 text-primary",
  followup: "bg-accent/10 text-accent",
  email: "bg-destructive/10 text-destructive",
  task: "bg-muted text-muted-foreground",
};

const priorityBadge: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-accent/10 text-accent",
  low: "bg-muted text-muted-foreground",
};

export const DailyAgenda = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const calendarConnected = isConnected("google-calendar");

  const fetchCalendarEvents = useCallback(async () => {
    if (!calendarConnected) return;
    setCalendarLoading(true);
    setNeedsReconnect(false);
    try {
      const { data } = await supabase.functions.invoke("calendar-fetch");
      if (data?.code === "RECONNECT_REQUIRED") {
        setNeedsReconnect(true);
        return;
      }
      if (data?.events) setCalendarEvents(data.events);
    } catch (err) {
      console.error("DailyAgenda calendar fetch error:", err);
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarConnected]);

  useEffect(() => {
    fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  const toggleComplete = (id: string) => {
    setCompletedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const stats = {
    meetings: mockAgenda.filter((i) => i.type === "meeting").length,
    followups: mockAgenda.filter((i) => i.type === "followup").length,
    urgent: mockAgenda.filter((i) => i.priority === "high").length,
    completed: completedItems.size,
  };

  return (
    <div className="max-w-4xl mx-auto">
      {needsReconnect && (
        <div className="mb-6">
          <ReconnectBanner service="google-calendar" />
        </div>
      )}

      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Today's Agenda</h1>
        <p className="text-muted-foreground">
          {agentName} has organized your day — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Meetings", value: stats.meetings, icon: Video, color: "text-primary" },
          { label: "Follow-ups", value: stats.followups, icon: Clock, color: "text-accent" },
          { label: "Urgent", value: stats.urgent, icon: AlertTriangle, color: "text-destructive" },
          { label: "Done", value: `${stats.completed}/${mockAgenda.length}`, icon: CheckCircle2, color: "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {mockAgenda.map((item, index) => {
          const Icon = typeIcons[item.type];
          const isCompleted = completedItems.has(item.id);
          return (
            <div
              key={item.id}
              className={`flex gap-4 p-4 rounded-2xl transition-all duration-200 cursor-pointer group ${
                isCompleted ? "opacity-50" : "hover:bg-muted/50"
              }`}
              onClick={() => toggleComplete(item.id)}
              style={{ animation: `fade-up 0.4s ease-out ${index * 0.05}s both` }}
            >
              {/* Time */}
              <div className="w-20 shrink-0 text-sm font-medium text-muted-foreground pt-1">
                {item.time}
              </div>

              {/* Timeline dot */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeColors[item.type]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {index < mockAgenda.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-semibold text-foreground ${isCompleted ? "line-through" : ""}`}>
                    {item.title}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityBadge[item.priority]}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {item.attendees && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    {item.attendees.join(", ")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
