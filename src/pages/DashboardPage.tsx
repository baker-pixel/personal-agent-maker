import { useNavigate } from "react-router-dom";
import { Mail, Calendar, FileText, Contact, ListTodo, Shield, Users, Megaphone, BookOpen, Cog } from "lucide-react";
import { format } from "date-fns";

import { useAgent } from "@/contexts/AgentContext";
import TasksWidget from "@/components/dashboard/TasksWidget";
import EmailSummaryWidget from "@/components/dashboard/EmailSummaryWidget";
import { UpcomingWidget } from "@/components/dashboard/UpcomingWidget";

const departments = [
  {
    name: "Admin",
    description: "Email, calendar, scheduling & task management",
    icon: Shield,
    active: true,
    capabilities: [
      { name: "Email", icon: Mail, active: true, path: "/email" },
      { name: "Calendar", icon: Calendar, active: true, path: "/calendar" },
      { name: "Files", icon: FileText, active: true, path: "/files" },
      { name: "Contacts", icon: Contact, active: true, path: "/contacts" },
      { name: "Tasks", icon: ListTodo, active: true, path: "/tasks" },
    ],
  },
  {
    name: "HR",
    description: "Hiring, onboarding, policy & employee relations",
    icon: Users,
    active: false,
    capabilities: [],
  },
  {
    name: "Marketing",
    description: "Content, social media, campaigns & analytics",
    icon: Megaphone,
    active: false,
    capabilities: [],
  },
  {
    name: "Bookkeeping",
    description: "Invoices, expenses, reports & reconciliation",
    icon: BookOpen,
    active: false,
    capabilities: [],
  },
  {
    name: "Operations",
    description: "Workflows, vendors, inventory & logistics",
    icon: Cog,
    active: false,
    capabilities: [],
  },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 sm:py-10 max-w-4xl px-4 space-y-8 pt-[var(--header-h)]">

        {/* Greeting */}
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">{today}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            {getGreeting()} 👋
          </h1>
          <p className="text-muted-foreground mt-1">{agentName} is ready to help manage your business.</p>
        </div>

        {/* At-a-glance widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EmailSummaryWidget />
          <TasksWidget />
        </div>

        {/* Upcoming: action items + contact reminders */}
        <UpcomingWidget
          onNavigateToTasks={() => navigate("/tasks")}
          onNavigateToReminders={() => navigate("/contacts")}
        />

        {/* Departments */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-4">Your Departments</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => {
              const Icon = dept.icon;
              return (
                <div
                  key={dept.name}
                  onClick={() => { if (!dept.active) navigate("/pricing"); }}
                  className={`relative border rounded-2xl p-6 transition-all ${
                    dept.active
                      ? "bg-background border-accent/40 shadow-sm"
                      : "bg-muted/30 border-border/50 cursor-pointer hover:border-accent/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dept.active ? "bg-accent/10" : "bg-muted"}`}>
                      <Icon className={`w-6 h-6 ${dept.active ? "text-accent" : "text-muted-foreground"}`} />
                    </div>
                    {dept.active ? (
                      <span className="text-xs font-medium text-accent bg-accent/10 px-3 py-1 rounded-full">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">Coming Soon</span>
                    )}
                  </div>

                  <h3 className="font-display text-lg font-semibold text-foreground mb-1">{dept.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{dept.description}</p>

                  {dept.active && dept.capabilities.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-border/50">
                      {dept.capabilities.map((cap) => (
                        <button
                          key={cap.name}
                          disabled={!cap.active}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cap.active) navigate(cap.path);
                          }}
                          className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-left text-sm transition-all ${
                            cap.active
                              ? "hover:bg-accent/5 cursor-pointer"
                              : "opacity-40 cursor-not-allowed"
                          }`}
                        >
                          <cap.icon className={`w-4 h-4 ${cap.active ? "text-accent" : "text-muted-foreground"}`} />
                          <span className={cap.active ? "text-foreground" : "text-muted-foreground"}>{cap.name}</span>
                          {!cap.active && <span className="text-[10px] text-muted-foreground ml-auto">Soon</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {!dept.active && (
                    <p className="text-xs text-accent font-medium">Click to learn more →</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
