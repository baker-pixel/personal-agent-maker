import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import {
  Gift,
  Heart,
  Plus,
  Calendar,
  Mail,
  Loader2,
  X,
  Bell,
  User,
  Repeat,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays, addYears, isBefore } from "date-fns";

interface ContactReminder {
  id: string;
  user_id: string;
  contact_name: string;
  contact_email: string | null;
  reminder_type: string;
  reminder_date: string;
  recurring: boolean;
  notes: string | null;
  last_action_at: string | null;
  created_at: string;
  updated_at: string;
}

const typeConfig = {
  birthday: { icon: Gift, color: "text-primary", bg: "bg-primary/10", label: "Birthday" },
  anniversary: { icon: Heart, color: "text-destructive", bg: "bg-destructive/10", label: "Anniversary" },
  follow_up: { icon: Mail, color: "text-accent", bg: "bg-accent/10", label: "Follow-up" },
  check_in: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted", label: "Check-in" },
} as const;

function getNextOccurrence(dateStr: string): Date {
  const d = parseISO(dateStr);
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (isBefore(next, now)) next = addYears(next, 1);
  return next;
}

function getDaysUntil(dateStr: string): number {
  return differenceInDays(getNextOccurrence(dateStr), new Date());
}

export const ContactReminders = () => {
  const { agentName } = useAgent();
  const { toast } = useToast();
  const [reminders, setReminders] = useState<ContactReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newReminder, setNewReminder] = useState({
    contact_name: "", contact_email: "", reminder_type: "birthday", reminder_date: "", notes: "", recurring: true,
  });

  const fetchReminders = useCallback(async () => {
    const { data, error } = await supabase
      .from("contact_reminders")
      .select("*")
      .order("reminder_date", { ascending: true });

    if (!error && data) {
      const sorted = (data as unknown as ContactReminder[]).sort(
        (a, b) => getDaysUntil(a.reminder_date) - getDaysUntil(b.reminder_date)
      );
      setReminders(sorted);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const addReminder = async () => {
    if (!newReminder.contact_name.trim() || !newReminder.reminder_date) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("contact_reminders")
      .insert({
        user_id: session.user.id,
        contact_name: newReminder.contact_name.trim(),
        contact_email: newReminder.contact_email || null,
        reminder_type: newReminder.reminder_type,
        reminder_date: newReminder.reminder_date,
        notes: newReminder.notes || null,
        recurring: newReminder.recurring,
      } as any)
      .select()
      .single();

    if (!error && data) {
      setReminders((prev) => [...prev, data as unknown as ContactReminder].sort(
        (a, b) => getDaysUntil(a.reminder_date) - getDaysUntil(b.reminder_date)
      ));
      setNewReminder({ contact_name: "", contact_email: "", reminder_type: "birthday", reminder_date: "", notes: "", recurring: true });
      setShowAdd(false);
      toast({ title: "Reminder added" });
    }
  };

  const deleteReminder = async (id: string) => {
    await supabase.from("contact_reminders").delete().eq("id", id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const upcoming = reminders.filter((r) => getDaysUntil(r.reminder_date) <= 30);
  const later = reminders.filter((r) => getDaysUntil(r.reminder_date) > 30);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ animation: "fade-up 0.3s ease-out both" }}>
        <div>
          <h1 className="font-display text-3xl text-foreground flex items-center gap-3">
            <Gift className="w-8 h-8 text-primary" />
            Relationship Reminders
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {reminders.length} tracked · {upcoming.length} coming up this month
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="glass-card rounded-2xl p-5 mb-6 space-y-3" style={{ animation: "fade-up 0.2s ease-out both" }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Name</label>
              <input
                value={newReminder.contact_name}
                onChange={(e) => setNewReminder({ ...newReminder, contact_name: e.target.value })}
                placeholder="Contact name"
                className="w-full bg-muted/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
              <input
                value={newReminder.contact_email}
                onChange={(e) => setNewReminder({ ...newReminder, contact_email: e.target.value })}
                placeholder="Optional"
                className="w-full bg-muted/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Type</label>
              <select
                value={newReminder.reminder_type}
                onChange={(e) => setNewReminder({ ...newReminder, reminder_type: e.target.value })}
                className="w-full bg-muted/30 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="birthday">Birthday</option>
                <option value="anniversary">Anniversary</option>
                <option value="follow_up">Follow-up</option>
                <option value="check_in">Check-in</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Date</label>
              <input
                type="date"
                value={newReminder.reminder_date}
                onChange={(e) => setNewReminder({ ...newReminder, reminder_date: e.target.value })}
                className="w-full bg-muted/30 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newReminder.recurring}
                  onChange={(e) => setNewReminder({ ...newReminder, recurring: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Repeat className="w-3 h-3" /> Recurring
                </span>
              </label>
            </div>
          </div>
          <textarea
            value={newReminder.notes}
            onChange={(e) => setNewReminder({ ...newReminder, notes: e.target.value })}
            placeholder="Notes (e.g., gift ideas, personal details)"
            className="w-full bg-muted/30 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none h-16"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={addReminder} disabled={!newReminder.contact_name.trim() || !newReminder.reminder_date} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground disabled:opacity-40">
              Add Reminder
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading reminders…</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center" style={{ animation: "fade-up 0.3s ease-out both" }}>
          <Gift className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No reminders yet — add birthdays, anniversaries, and follow-ups</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
                Coming Up (next 30 days)
              </h2>
              <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.05s both" }}>
                {upcoming.map((r) => <ReminderCard key={r.id} reminder={r} onDelete={deleteReminder} />)}
              </div>
            </div>
          )}

          {/* Later */}
          {later.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
                Later
              </h2>
              <div className="space-y-2" style={{ animation: "fade-up 0.3s ease-out 0.1s both" }}>
                {later.map((r) => <ReminderCard key={r.id} reminder={r} onDelete={deleteReminder} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ReminderCard = ({ reminder, onDelete }: { reminder: ContactReminder; onDelete: (id: string) => void }) => {
  const days = getDaysUntil(reminder.reminder_date);
  const type = typeConfig[reminder.reminder_type as keyof typeof typeConfig] || typeConfig.check_in;
  const Icon = type.icon;
  const isUrgent = days <= 7;

  return (
    <div className={`glass-card rounded-xl p-4 transition-all ${isUrgent ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${type.bg}`}>
          <Icon className={`w-4 h-4 ${type.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{reminder.contact_name}</p>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${type.bg} ${type.color}`}>
              {type.label}
            </span>
            {reminder.recurring && <Repeat className="w-3 h-3 text-muted-foreground/40" />}
          </div>
          {reminder.contact_email && (
            <p className="text-[11px] text-muted-foreground">{reminder.contact_email}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(parseISO(reminder.reminder_date), "MMM d")}
            </span>
            <span className={`text-xs font-medium ${isUrgent ? "text-primary" : "text-muted-foreground"}`}>
              {days === 0 ? "🎉 Today!" : days === 1 ? "Tomorrow" : `${days} days away`}
            </span>
          </div>
          {reminder.notes && (
            <p className="text-xs text-muted-foreground/70 mt-2 bg-muted/30 rounded-lg px-3 py-2">{reminder.notes}</p>
          )}
        </div>
        <button onClick={() => onDelete(reminder.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
