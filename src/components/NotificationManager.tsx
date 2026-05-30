/**
 * Invisible component — renders nothing, only fires push notifications.
 * Mount once in AppHeader so it runs on every page.
 */
import { useEffect, useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useTodayData } from "@/hooks/useTodayData";

export function NotificationManager() {
  const { permission, notify } = usePushNotifications();
  const { todayEvents, urgentEmailCount, overdueTaskCount } = useTodayData();
  const [tick, setTick] = useState(0);

  // Tick every minute to re-check meeting countdowns
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Meeting countdown notifications
  useEffect(() => {
    if (permission !== "granted") return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    for (const event of todayEvents) {
      try {
        const startMs = new Date(event.start).getTime();
        const minsUntil = Math.round((startMs - now.getTime()) / 60_000);

        // 15-minute warning
        if (minsUntil >= 13 && minsUntil <= 16) {
          notify(
            `Meeting in 15 min`,
            event.summary,
            `meeting-15-${event.id}-${todayStr}`,
          );
        }
        // 5-minute warning
        if (minsUntil >= 3 && minsUntil <= 6) {
          notify(
            `⏰ Starting in 5 min`,
            event.summary,
            `meeting-5-${event.id}-${todayStr}`,
          );
        }
      } catch {}
    }
  }, [tick, todayEvents, permission, notify]);

  // Urgent emails — once per day, fires when data loads
  useEffect(() => {
    if (permission !== "granted" || urgentEmailCount === 0) return;
    const key = `urgent-emails-${new Date().toISOString().slice(0, 10)}`;
    notify(
      `${urgentEmailCount} urgent email${urgentEmailCount > 1 ? "s" : ""} need attention`,
      "Tap to open your inbox",
      key,
    );
  }, [urgentEmailCount, permission, notify]);

  // Overdue tasks — once per day, only after 9 AM
  useEffect(() => {
    if (permission !== "granted" || overdueTaskCount === 0) return;
    const now = new Date();
    if (now.getHours() < 9) return;
    const key = `overdue-tasks-${now.toISOString().slice(0, 10)}`;
    notify(
      `${overdueTaskCount} overdue task${overdueTaskCount > 1 ? "s" : ""}`,
      "You have tasks past their due date",
      key,
    );
  }, [overdueTaskCount, permission, notify]);

  return null;
}
