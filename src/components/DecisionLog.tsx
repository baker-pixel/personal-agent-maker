import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Gavel, Users, Calendar, ChevronDown, ChevronUp, Plus, Tag } from "lucide-react";

interface Decision {
  id: string;
  title: string;
  date: string;
  context: string;
  outcome: string;
  stakeholders: string[];
  source: "meeting" | "email" | "chat" | "manual";
  tags: string[];
  followUpActions: string[];
}

const mockDecisions: Decision[] = [
  {
    id: "1", title: "Approved Series B term sheet from Venture Co", date: "Mar 24, 2026",
    context: "After reviewing 3 term sheets, the board recommended Venture Co for strategic value and favorable terms.",
    outcome: "Proceeding with Venture Co at $40M valuation. Signing by April 5.",
    stakeholders: ["Mike Ross", "Board of Directors", "Legal Team"],
    source: "meeting", tags: ["fundraising", "board"],
    followUpActions: ["Send signed LOI to Mike", "Schedule due diligence kick-off", "Notify existing investors"],
  },
  {
    id: "2", title: "Delayed product launch to May 15", date: "Mar 22, 2026",
    context: "Engineering flagged critical performance issues in beta. Customer feedback indicated UX improvements needed.",
    outcome: "Moved launch from April 1 to May 15. Added 2 engineers to the team.",
    stakeholders: ["Sarah Chen", "Engineering Team", "Marketing"],
    source: "meeting", tags: ["product", "engineering"],
    followUpActions: ["Update marketing calendar", "Notify beta customers", "Revised sprint planning"],
  },
  {
    id: "3", title: "Hired external legal counsel for IP review", date: "Mar 18, 2026",
    context: "Internal legal capacity insufficient for upcoming patent filings and partnership IP agreements.",
    outcome: "Engaged Wilson Legal for IP portfolio review. $15K retainer.",
    stakeholders: ["James Wilson", "CFO"],
    source: "email", tags: ["legal", "IP"],
    followUpActions: ["Send all patent docs to Wilson Legal", "Schedule IP audit meeting"],
  },
  {
    id: "4", title: "Switched to quarterly board meetings", date: "Mar 10, 2026",
    context: "Monthly meetings were taking too much prep time and becoming redundant between milestones.",
    outcome: "Moving to quarterly cadence with monthly async updates via email.",
    stakeholders: ["Board of Directors"],
    source: "meeting", tags: ["board", "operations"],
    followUpActions: ["Set up monthly email template", "Cancel recurring monthly invites"],
  },
];

const sourceColors: Record<string, string> = {
  meeting: "bg-primary/10 text-primary",
  email: "bg-accent/10 text-accent",
  chat: "bg-muted text-muted-foreground",
  manual: "bg-muted text-muted-foreground",
};

export const DecisionLog = () => {
  const { agentName } = useAgent();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground mb-2">Decision Log</h1>
          <p className="text-muted-foreground">
            {agentName} records key decisions with context and follow-ups.
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Log Decision
        </button>
      </div>

      <div className="space-y-3">
        {mockDecisions.map((decision, index) => (
          <div
            key={decision.id}
            className="glass-card rounded-2xl overflow-hidden"
            style={{ animation: `fade-up 0.4s ease-out ${index * 0.08}s both` }}
          >
            <button
              className="w-full flex items-center gap-4 p-5 text-left"
              onClick={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Gavel className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{decision.title}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{decision.date}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${sourceColors[decision.source]}`}>
                    {decision.source}
                  </span>
                </div>
              </div>
              {expandedId === decision.id ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {expandedId === decision.id && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Context</h4>
                  <p className="text-sm text-foreground bg-muted/30 rounded-xl p-3">{decision.context}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Outcome</h4>
                  <p className="text-sm text-foreground bg-primary/5 rounded-xl p-3">{decision.outcome}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stakeholders</h4>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{decision.stakeholders.join(", ")}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Follow-up Actions</h4>
                  <ul className="space-y-1">
                    {decision.followUpActions.map((action, i) => (
                      <li key={i} className="text-sm text-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex flex-wrap gap-2">
                    {decision.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
                        <Tag className="w-3 h-3" />{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
