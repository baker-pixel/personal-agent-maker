import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Mail, Calendar, Settings, LogOut, Home, Users, Inbox, NotebookPen } from "lucide-react";
import { performSignOut } from "@/lib/signOut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AppMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSignOut, setShowSignOut] = useState(false);

  const navItems = [
    { label: "Home", path: "/mode-select", icon: Home },
    { label: "Steno", path: "/steno", icon: NotebookPen },
    { label: "Email", path: "/email", icon: Mail },
    { label: "Approval Inbox", path: "/inbox", icon: Inbox },
    { label: "Calendar", path: "/calendar", icon: Calendar },
    { label: "Contacts", path: "/contacts", icon: Users },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-52">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <DropdownMenuItem
                key={item.path}
                onClick={() => navigate(item.path)}
                className={isActive ? "bg-accent/10 text-accent font-medium focus:bg-accent/15 focus:text-accent" : ""}
              >
                <item.icon className={`w-4 h-4 mr-2 ${isActive ? "text-accent" : ""}`} />
                {item.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings")}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowSignOut(true)}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showSignOut} onOpenChange={setShowSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign back in to access your account and connected integrations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => performSignOut("/")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
