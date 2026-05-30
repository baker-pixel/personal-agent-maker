import { useNavigate } from "react-router-dom";
import { ArrowLeft, Smartphone, Clock } from "lucide-react";
import { useAgent } from "@/contexts/AgentContext";

export default function SmsLog() {
  const navigate = useNavigate();
  const { agentName } = useAgent();

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      <nav className="border-b bg-background sticky top-[var(--header-h)] z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="font-display font-semibold">SMS</h1>
          <div className="w-14" />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-8" style={{ minHeight: "60vh" }}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
            <Smartphone className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold mb-4">
            <Clock className="w-3 h-3" />
            Coming soon
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">
            SMS with {agentName}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Soon you'll be able to text {agentName} directly — ask questions, approve drafts, get briefed, and manage your day without opening the app.
          </p>
        </div>
      </div>
    </div>
  );
}
