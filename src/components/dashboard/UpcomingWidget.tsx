import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ListTodo,
  Gift,
  ArrowUpRight,
  CheckCircle2,
  Heart,
  Mail,
  Bell,
} from "lucide-react";
import { format, parseISO, isPast, isToday, differenceInDays, addYears, isBefore, addDays, startOfDay } from "date-fns";

interface ActionItem {
  id: string;
  title: string;
  assignee: string | null;
  due_date: string | null;
  priority: string;
  status: string;
}

interface ContactReminder {
  id: string;
  contact_name: string;
  reminder_type: string;
  reminder_date: string;
}

function getNextOccurrence(dateStr: string): Date {
  const d = parseISO(dateStr);
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (isBefore(next, now) && !isToday(next)) next = addYears(next, 1);
  return next;
}

function getDaysUntil(dateStr: string): number {
  return differenceInDays(getNextOccurrence(dateStr), new Date());
}

const typeIcons = {
  birthday: Gift,
  anniversary: Heart,
  follow_up: Mail,
  check_in: Bell,
} as const;

const priorityColors = {
  high: "text-destructive",
  medium: "text-accent",
  low: "text-muted-foreground",
} as const;

interface Props {
  onNavigateToTasks: () => void;
  onNavigateToReminders: () => void;
}

export const UpcomingWidget = ({ onNavigateToTasks, onNavigateToReminders }: Props) => {
  const [overdueItems, setOverdueItems] = useState<ActionItem[]>([]);
  const [openItems, setOpenItems] = useState<ActionItem[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<ContactReminder[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data: items } = await supabase
        .from("action_items")
        .select("id, title, assignee, due_date, priority, status")
        .eq("status", "open")
        .order("due_date", { ascending: true })
        .limit(10);

      if (items) {
        const typed = items as unknown as ActionItem[];
        // Only show items due tomorrow or later (today/overdue handled by TasksWidget)
        const tomorrow = startOfDay(addDays(new Date(), 1));
        const future = typed.filter(
          (i) => i.due_date && parseISO(i.due_date) >= tomorrow
        ).slice(0, 4);
        setOverdueItems([]);
        setOpenItems(future);
      }

      const { data: reminders } = await supabase
        .from("contact_reminders")
        .select("id, contact_name, reminder_type, reminder_date")
        .limit(20);

      if (reminders) {
        const typed = (reminders as unknown as ContactReminder[])
          .map((r) => ({ ...r, _days: getDaysUntil(r.reminder_date) }))
          .filter((r) => r._days <= 30 && r._days >= 0)
          .sort((a, b) => a._days - b._days)
          .slice(0, 4);
        setUpcomingReminders(typed);
      }
    };
    fetch();
  }, []);

  const hasContent = openItems.length > 0 || upcomingReminders.length > 0;
  if (!hasContent) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Action Items */}
      <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <ListTodo className="w-4 h-4 text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Upcoming Tasks</h2>
          </div>
          <button
            onClick={onNavigateToTasks}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="px-4 pb-4">
          {openItems.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground/50">
              <span className="text-xs">Nothing due in the next few days</span>
            </div>
          ) : (
            <div className="space-y-1">
              {openItems.map((item) => {
                const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date));
                const pColor = priorityColors[item.priority as keyof typeof priorityColors] || "text-muted-foreground";
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/30 transition-all"
                  >
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${pColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.assignee && (
                          <span className="text-[10px] text-muted-foreground">{item.assignee}</span>
                        )}
                        {item.due_date && (
                          <span className={`text-[10px] ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            {format(parseISO(item.due_date), "MMM d")}
                            {isOverdue && " ⚠️"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Upcoming Reminders */}
      <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Gift className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Upcoming Reminders</h2>
          </div>
          <button
            onClick={onNavigateToReminders}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/5"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="px-4 pb-4">
          {upcomingReminders.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground/50">
              <span className="text-xs">No upcoming reminders this month</span>
            </div>
          ) : (
            <div className="space-y-1">
              {upcomingReminders.map((r) => {
                const days = getDaysUntil(r.reminder_date);
                const Icon = typeIcons[r.reminder_type as keyof typeof typeIcons] || Bell;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/30 transition-all"
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.contact_name}</p>
                      <span className="text-[10px] text-muted-foreground capitalize">{r.reminder_type.replace("_", " ")}</span>
                    </div>
                    <span className={`text-[10px] font-medium shrink-0 ${days <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                      {days === 0 ? "Today! 🎉" : days === 1 ? "Tomorrow" : `${days}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
