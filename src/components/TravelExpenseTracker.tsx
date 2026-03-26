import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { Plane, Hotel, Car, Receipt, MapPin, Calendar, DollarSign, ChevronRight } from "lucide-react";

interface TravelItem {
  id: string;
  type: "flight" | "hotel" | "transport" | "expense";
  title: string;
  date: string;
  location: string;
  amount: number;
  currency: string;
  status: "upcoming" | "completed" | "pending_receipt";
  details: string;
  confirmationCode?: string;
}

const mockTravel: TravelItem[] = [
  { id: "1", type: "flight", title: "SFO → JFK", date: "Apr 2, 2026", location: "United Airlines UA 234", amount: 680, currency: "USD", status: "upcoming", details: "Departs 7:15 AM, arrives 3:45 PM. Seat 12A. Confirmation: UA7X9K2", confirmationCode: "UA7X9K2" },
  { id: "2", type: "hotel", title: "The Standard, NYC", date: "Apr 2–4, 2026", location: "848 Washington St, New York", amount: 450, currency: "USD", status: "upcoming", details: "2 nights, King room. Late checkout requested.", confirmationCode: "STD-88291" },
  { id: "3", type: "transport", title: "Airport car service", date: "Apr 2, 2026", location: "JFK → Manhattan", amount: 85, currency: "USD", status: "upcoming", details: "Blacklane pickup at Terminal 7, 4:15 PM" },
  { id: "4", type: "flight", title: "JFK → SFO", date: "Apr 4, 2026", location: "United Airlines UA 891", amount: 720, currency: "USD", status: "upcoming", details: "Departs 6:00 PM, arrives 9:15 PM. Seat 8C.", confirmationCode: "UA8M3P1" },
  { id: "5", type: "expense", title: "Client dinner — Nobu", date: "Mar 20, 2026", location: "New York", amount: 340, currency: "USD", status: "pending_receipt", details: "Dinner with Acme Corp team. 4 attendees." },
  { id: "6", type: "expense", title: "Uber rides — SF", date: "Mar 18–22, 2026", location: "San Francisco", amount: 127, currency: "USD", status: "completed", details: "5 rides, business travel" },
];

const typeIcons: Record<string, React.ElementType> = { flight: Plane, hotel: Hotel, transport: Car, expense: Receipt };
const typeColors: Record<string, string> = {
  flight: "bg-primary/10 text-primary",
  hotel: "bg-accent/10 text-accent",
  transport: "bg-muted text-foreground",
  expense: "bg-destructive/10 text-destructive",
};
const statusColors: Record<string, string> = {
  upcoming: "bg-primary/10 text-primary",
  completed: "bg-muted text-muted-foreground",
  pending_receipt: "bg-destructive/10 text-destructive",
};

export const TravelExpenseTracker = () => {
  const { agentName } = useAgent();
  const [filter, setFilter] = useState<"all" | "travel" | "expenses">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = mockTravel.filter((item) => {
    if (filter === "travel") return item.type !== "expense";
    if (filter === "expenses") return item.type === "expense";
    return true;
  });

  const totalUpcoming = mockTravel.filter((i) => i.status === "upcoming").reduce((s, i) => s + i.amount, 0);
  const totalExpenses = mockTravel.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
  const pendingReceipts = mockTravel.filter((i) => i.status === "pending_receipt").length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Travel & Expenses</h1>
        <p className="text-muted-foreground">
          {agentName} tracks your itineraries and expenses automatically.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card rounded-2xl p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold text-foreground">${totalUpcoming.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Upcoming Travel</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <Receipt className="w-5 h-5 mx-auto mb-1 text-accent" />
          <p className="text-2xl font-bold text-foreground">${totalExpenses.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Recent Expenses</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <Receipt className="w-5 h-5 mx-auto mb-1 text-destructive" />
          <p className="text-2xl font-bold text-foreground">{pendingReceipts}</p>
          <p className="text-xs text-muted-foreground">Pending Receipts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(["all", "travel", "expenses"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-3">
        {filtered.map((item, index) => {
          const Icon = typeIcons[item.type];
          return (
            <div
              key={item.id}
              className="glass-card rounded-2xl overflow-hidden"
              style={{ animation: `fade-up 0.4s ease-out ${index * 0.05}s both` }}
            >
              <button
                className="w-full flex items-center gap-4 p-5 text-left"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeColors[item.type]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground">{item.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{item.date}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.location}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-foreground">${item.amount}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[item.status]}`}>
                    {item.status.replace("_", " ")}
                  </span>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedId === item.id ? "rotate-90" : ""}`} />
              </button>
              {expandedId === item.id && (
                <div className="px-5 pb-5 border-t border-border pt-4">
                  <p className="text-sm text-foreground">{item.details}</p>
                  {item.confirmationCode && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Confirmation: <span className="font-mono text-foreground">{item.confirmationCode}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
