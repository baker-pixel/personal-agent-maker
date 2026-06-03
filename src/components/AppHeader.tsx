import { useNavigate } from "react-router-dom";
import normyLogo from "@/assets/normy-logo.png";
import AppMenu from "@/components/AppMenu";
import { NotificationCenter } from "@/components/NotificationCenter";
import { NotificationManager } from "@/components/NotificationManager";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function AppHeader() {
  const navigate = useNavigate();
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[60] bg-background border-b shadow-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center justify-between h-14 px-4">
        <button onClick={() => navigate("/mode-select")} className="shrink-0">
          <img src={normyLogo} alt="Normy Agent" className="h-7 w-auto" />
        </button>
        <div className="flex items-center gap-0.5">
          <ErrorBoundary variant="widget"><NotificationCenter /></ErrorBoundary>
          <AppMenu />
        </div>
      </div>
      <ErrorBoundary variant="widget"><NotificationManager /></ErrorBoundary>
    </header>
  );
}
