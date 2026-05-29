import { AgentProvider } from "@/contexts/AgentContext";
import { EndOfDayWrapup } from "@/components/EndOfDayWrapup";

export default function EodWrapupPage() {
  return (
    <AgentProvider>
      <div className="min-h-screen bg-background">
        <div className="container pt-[var(--header-h)] pb-10">
          <EndOfDayWrapup />
        </div>
      </div>
    </AgentProvider>
  );
}
