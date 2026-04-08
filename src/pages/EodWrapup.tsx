import { AgentProvider } from "@/contexts/AgentContext";
import { EndOfDayWrapup } from "@/components/EndOfDayWrapup";

export default function EodWrapupPage() {
  return (
    <AgentProvider>
      <div className="min-h-screen bg-background">
        <div className="container py-10">
          <EndOfDayWrapup />
        </div>
      </div>
    </AgentProvider>
  );
}
