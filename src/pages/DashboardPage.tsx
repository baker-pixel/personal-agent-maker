import { useNavigate } from "react-router-dom";
import { Mail, Calendar, FileText, Contact, ListTodo, Shield, Users, Megaphone, BookOpen, Cog } from "lucide-react";

import normyLogo from "@/assets/normy-logo.png";
import { useAgent } from "@/contexts/AgentContext";

const departments = [
  {
    name: "Admin",
    description: "Email, calendar, scheduling & task management",
    icon: Shield,
    active: true,
    capabilities: [
      { name: "Email", icon: Mail, active: true, path: "/email" },
      { name: "Calendar", icon: Calendar, active: true, path: "/calendar" },
      { name: "Files", icon: FileText, active: false, path: "" },
      { name: "Contacts", icon: Contact, active: false, path: "" },
      { name: "Tasks", icon: ListTodo, active: false, path: "" },
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

export default function Dashboard() {
  const navigate = useNavigate();
  const { agentName } = useAgent();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/mode-select")}>
            <img src={normyLogo} alt="Normy Agent" className="h-7 w-auto" />
          </div>
        </div>
      </nav>

      <div className="container py-8 sm:py-10 max-w-4xl px-4">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-1">Your Departments</h1>
          <p className="text-muted-foreground">{agentName} is ready to help manage your business.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const Icon = dept.icon;
            return (
              <div
                key={dept.name}
                onClick={() => {
                  if (!dept.active) navigate("/pricing");
                }}
                className={`relative border rounded-2xl p-6 transition-all ${
                  dept.active
                    ? "bg-background border-accent/40 shadow-sm"
                    : "bg-muted/30 border-border/50 cursor-pointer hover:border-accent/30 hover:shadow-sm"
                }`}
              >
                {/* Status badge */}
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

                {/* Capabilities for active departments */}
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

                {/* CTA for inactive */}
                {!dept.active && (
                  <p className="text-xs text-accent font-medium">Click to learn more →</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
