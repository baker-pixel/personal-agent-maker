import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Calendar, FileText, Contact, ListTodo } from "lucide-react";
import AppMenu from "@/components/AppMenu";
import normyLogo from "@/assets/normy-logo.png";
import { useAgent } from "@/contexts/AgentContext";

const tabs = [
  { name: "Admin", active: true },
  { name: "HR", active: false },
  { name: "Marketing", active: false },
  { name: "Bookkeeping", active: false },
];

const capabilities = [
  { name: "Email", icon: Mail, active: true, path: "/email" },
  { name: "Calendar", icon: Calendar, active: true, path: "/calendar" },
  { name: "Files", icon: FileText, active: false, path: "" },
  { name: "Contacts", icon: Contact, active: false, path: "" },
  { name: "Tasks", icon: ListTodo, active: false, path: "" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { agentName } = useAgent();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/mode-select")}>
            <img src={normyLogo} alt="Normy Agent" className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                onClick={() => {
                  if (!tab.active) navigate("/settings#departments");
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab.active
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50 cursor-pointer"
                }`}
              >
                {tab.name}
                {!tab.active && <span className="ml-1 text-[10px] align-super text-accent">+</span>}
              </button>
            ))}
          </div>
          <AppMenu />
        </div>
      </nav>

      <div className="container py-10 max-w-4xl">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-1">Admin</h1>
          <p className="text-muted-foreground">{agentName} is ready to help manage your business.</p>
        </div>

        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold mb-4">Capabilities</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {capabilities.map((cap) => (
              <button
                key={cap.name}
                disabled={!cap.active}
                onClick={() => cap.active && navigate(cap.path)}
                className={`flex items-center gap-4 border rounded-xl p-5 text-left transition-all ${
                  cap.active
                    ? "bg-background hover:shadow-md hover:border-accent/40 cursor-pointer"
                    : "bg-muted/40 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${cap.active ? "bg-accent/10" : "bg-muted"}`}>
                  <cap.icon className={`w-5 h-5 ${cap.active ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-medium">{cap.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cap.active ? "Active" : "Coming soon"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
