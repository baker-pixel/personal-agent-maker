import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Mail, Calendar, LayoutDashboard, Settings, LogOut, Home, Building2, Users, Flame, ListTodo } from "lucide-react";
import { performSignOut } from "@/lib/signOut";
import { useAgent } from "@/contexts/AgentContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agentName } = useAgent();

  const navItems = [
    { label: "Home", path: "/mode-select", icon: Home },
    { label: `${agentName}'s Office`, path: "/office", icon: Building2 },
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Email", path: "/email", icon: Mail },
    { label: "Calendar", path: "/calendar", icon: Calendar },
    { label: "Leads", path: "/leads", icon: Flame },
    { label: "Contacts", path: "/contacts", icon: Users },
    { label: "Tasks", path: "/tasks", icon: ListTodo },
  ];

  const handleSignOut = async () => {
    await performSignOut("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {navItems.map((item) => (
          <DropdownMenuItem
            key={item.path}
            onClick={() => navigate(item.path)}
            className={location.pathname === item.path ? "bg-secondary" : ""}
          >
            <item.icon className="w-4 h-4 mr-2" />
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="text-muted-foreground">
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
