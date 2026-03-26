import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Users, Mail, Calendar, Clock, ChevronDown, ChevronUp, Search, Star } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  lastInteraction: string;
  interactionCount: number;
  openThreads: number;
  meetingsThisMonth: number;
  relationship: "key" | "regular" | "new";
  notes: string;
  recentTopics: string[];
}

const mockContacts: Contact[] = [
  {
    id: "1", name: "Sarah Chen", email: "sarah@acmecorp.com", company: "Acme Corp",
    role: "VP of Partnerships", lastInteraction: "2 hours ago", interactionCount: 47,
    openThreads: 3, meetingsThisMonth: 4, relationship: "key",
    notes: "Key partner for Q3 deal. Prefers morning meetings. Decision-maker for enterprise contracts.",
    recentTopics: ["Partnership renewal", "Pricing discussion", "Integration timeline"],
  },
  {
    id: "2", name: "Mike Ross", email: "mike@venture.co", company: "Venture Capital Co",
    role: "Managing Partner", lastInteraction: "Yesterday", interactionCount: 23,
    openThreads: 1, meetingsThisMonth: 2, relationship: "key",
    notes: "Series B lead. Interested in growth metrics. Responsive on Tuesdays.",
    recentTopics: ["Series B terms", "Board composition", "Growth metrics"],
  },
  {
    id: "3", name: "Lisa Park", email: "lisa@designstudio.io", company: "Design Studio",
    role: "Creative Director", lastInteraction: "3 days ago", interactionCount: 15,
    openThreads: 2, meetingsThisMonth: 1, relationship: "regular",
    notes: "Leading the rebrand project. Great eye for detail. Prefers async communication.",
    recentTopics: ["Brand guidelines", "Website redesign", "Logo variations"],
  },
  {
    id: "4", name: "James Wilson", email: "james@legal.com", company: "Wilson Legal",
    role: "Senior Counsel", lastInteraction: "1 week ago", interactionCount: 8,
    openThreads: 1, meetingsThisMonth: 0, relationship: "regular",
    notes: "Handles contract reviews. Typically 48-hour turnaround. Bills hourly.",
    recentTopics: ["Contract renewal", "NDA review", "IP assignment"],
  },
  {
    id: "5", name: "Ana Garcia", email: "ana@newclient.com", company: "NewClient Inc",
    role: "CTO", lastInteraction: "Today", interactionCount: 3,
    openThreads: 1, meetingsThisMonth: 1, relationship: "new",
    notes: "New prospect from conference. Interested in enterprise plan. Technical buyer.",
    recentTopics: ["Product demo", "Technical requirements"],
  },
];

const relationshipColors: Record<string, string> = {
  key: "bg-primary/10 text-primary",
  regular: "bg-accent/10 text-accent",
  new: "bg-muted text-muted-foreground",
};

export const ContactIntelligence = () => {
  const { agentName } = useAgent();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = mockContacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Contact Intelligence</h1>
        <p className="text-muted-foreground">
          {agentName} tracks your key relationships and interaction history.
        </p>
      </div>

      {/* Search */}
      <div className="glass-card rounded-2xl p-3 flex items-center gap-3 mb-6">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Key Contacts", value: mockContacts.filter((c) => c.relationship === "key").length, icon: Star },
          { label: "Open Threads", value: mockContacts.reduce((s, c) => s + c.openThreads, 0), icon: Mail },
          { label: "Meetings This Month", value: mockContacts.reduce((s, c) => s + c.meetingsThisMonth, 0), icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card rounded-2xl p-4 text-center">
            <Icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Contact list */}
      <div className="space-y-3">
        {filtered.map((contact, index) => (
          <div
            key={contact.id}
            className="glass-card rounded-2xl overflow-hidden transition-all duration-300"
            style={{ animation: `fade-up 0.4s ease-out ${index * 0.05}s both` }}
          >
            <button
              className="w-full flex items-center gap-4 p-5 text-left"
              onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {contact.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{contact.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${relationshipColors[contact.relationship]}`}>
                    {contact.relationship}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{contact.role} · {contact.company}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{contact.lastInteraction}</p>
                <p className="text-xs text-muted-foreground">{contact.interactionCount} interactions</p>
              </div>
              {expandedId === contact.id ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {expandedId === contact.id && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded-xl bg-muted/50">
                    <p className="text-lg font-bold text-foreground">{contact.openThreads}</p>
                    <p className="text-xs text-muted-foreground">Open Threads</p>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/50">
                    <p className="text-lg font-bold text-foreground">{contact.meetingsThisMonth}</p>
                    <p className="text-xs text-muted-foreground">Meetings/Month</p>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/50">
                    <p className="text-lg font-bold text-foreground">{contact.interactionCount}</p>
                    <p className="text-xs text-muted-foreground">Total Interactions</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Notes</h4>
                  <p className="text-sm text-foreground bg-muted/30 rounded-xl p-3">{contact.notes}</p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Topics</h4>
                  <div className="flex flex-wrap gap-2">
                    {contact.recentTopics.map((topic) => (
                      <span key={topic} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
                        {topic}
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
