import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TodayEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: { email: string; displayName?: string; responseStatus?: string }[];
  htmlLink?: string;
}

export interface TodayData {
  todayEvents: TodayEvent[];
  nextMeeting: TodayEvent | null;
  minutesUntilNext: number | null;
  isInMeeting: boolean;
  urgentEmailCount: number;
  needsReplyCount: number;
  overdueTaskCount: number;
  dueTodayCount: number;
  suggestedTaskCount: number;
  loading: boolean;
  refetch: () => void;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useTodayData(): TodayData {
  const [todayEvents, setTodayEvents] = useState<TodayEvent[]>([]);
  const [urgentEmailCount, setUrgentEmailCount] = useState(0);
  const [needsReplyCount, setNeedsReplyCount] = useState(0);
  const [overdueTaskCount, setOverdueTaskCount] = useState(0);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [suggestedTaskCount, setSuggestedTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // drives live countdown

  const fetchAll = useCallback(async () => {
    try {
      const todayStr = toLocalDateStr(new Date());

      const [calResult, urgentRes, replyRes, tasksRes, suggestedRes] = await Promise.all([
        supabase.functions.invoke("calendar-fetch"),
        // Same filter as EmailSummaryWidget: unreplied + not snoozed
        supabase
          .from("email_metadata")
          .select("id", { count: "exact", head: true })
          .eq("category", "urgent")
          .is("replied_at", null)
          .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`),
        supabase
          .from("email_metadata")
          .select("id", { count: "exact", head: true })
          .eq("category", "needs_reply")
          .is("replied_at", null)
          .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`),
        supabase
          .from("action_items")
          .select("id, due_date")
          .eq("status", "open")
          .not("due_date", "is", null),
        supabase
          .from("action_items")
          .select("id", { count: "exact", head: true })
          .eq("status", "suggested"),
      ]);

      // Calendar — filter to local today, sort by start time
      const allEvents: TodayEvent[] = calResult.data?.events || [];
      const todayEvs = allEvents
        .filter(e => e.start && toLocalDateStr(new Date(e.start)) === todayStr)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      setTodayEvents(todayEvs);

      setUrgentEmailCount(urgentRes.count ?? 0);
      setNeedsReplyCount(replyRes.count ?? 0);
      setSuggestedTaskCount(suggestedRes.count ?? 0);

      const tasks = tasksRes.data ?? [];
      setOverdueTaskCount(tasks.filter(t => t.due_date! < todayStr).length);
      setDueTodayCount(tasks.filter(t => t.due_date === todayStr).length);
    } catch {
      // silent — partial data still useful
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Tick every 60s for live countdown
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Derived — recalculated every tick
  const nowMs = Date.now() + tick * 0; // tick forces re-render
  const nowTime = new Date();
  const upcoming = todayEvents.filter(e => new Date(e.end).getTime() > nowMs);
  const nextMeeting = upcoming[0] ?? null;
  const minutesUntilNext = nextMeeting
    ? Math.round((new Date(nextMeeting.start).getTime() - nowTime.getTime()) / 60_000)
    : null;
  const isInMeeting = minutesUntilNext !== null && minutesUntilNext <= 0 &&
    nowTime.getTime() < new Date(nextMeeting!.end).getTime();

  return {
    todayEvents,
    nextMeeting,
    minutesUntilNext,
    isInMeeting,
    urgentEmailCount,
    needsReplyCount,
    overdueTaskCount,
    dueTodayCount,
    suggestedTaskCount,
    loading,
    refetch: fetchAll,
  };
}
