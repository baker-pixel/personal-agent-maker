import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

const supported =
  typeof Notification !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

// Once-per-key dedup for local notifications. Callers pass a stable key
// (e.g. `urgent-emails-2026-06-11`) so a notification fires once per key —
// not again on every mount, reload, or PWA cold start.
const NOTIFIED_KEYS_STORAGE = "normy_notified_keys";
function alreadyNotified(key: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(NOTIFIED_KEYS_STORAGE) || "[]") as string[]).includes(key);
  } catch {
    return false;
  }
}
function markNotified(key: string) {
  try {
    const keys = (JSON.parse(localStorage.getItem(NOTIFIED_KEYS_STORAGE) || "[]") as string[])
      .filter((k) => k !== key);
    keys.push(key);
    localStorage.setItem(NOTIFIED_KEYS_STORAGE, JSON.stringify(keys.slice(-200)));
  } catch {}
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await supabase.from("push_subscriptions").upsert(
    {
      user_id: session.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "user_id,endpoint" }
  );
}

async function getOrCreateSubscription(): Promise<PushSubscription | null> {
  if (!supported || !VAPID_PUBLIC_KEY) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  } catch (e) {
    console.warn("PushManager.subscribe failed:", e);
    return null;
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!supported) return "unsupported";
    return Notification.permission as PushPermission;
  });

  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (!supported) return "unsupported";
    try {
      const result = (await Notification.requestPermission()) as PushPermission;
      setPermission(result);
      if (result === "granted") {
        const sub = await getOrCreateSubscription();
        if (sub) await saveSubscription(sub);
      }
      return result;
    } catch {
      return "denied";
    }
  }, []);

  // Auto-subscribe if permission already granted (e.g. returning user)
  const ensureSubscribed = useCallback(async (): Promise<void> => {
    if (!supported || Notification.permission !== "granted") return;
    const sub = await getOrCreateSubscription();
    if (sub) await saveSubscription(sub);
  }, []);

  // Local notification while the app is open. Fires at most once per `key`
  // (persisted in localStorage) — without this, every mount / reload / PWA
  // cold start re-announced the same urgent emails and overdue tasks.
  const notify = useCallback(
    async (title: string, body: string, key: string, opts?: { tag?: string }) => {
      if (!supported || Notification.permission !== "granted") return;
      if (alreadyNotified(key)) return;
      markNotified(key);
      const options: NotificationOptions = {
        body,
        icon: "/icon-192.png",
        badge: "/favicon.png",
        // tag makes the OS replace a still-visible duplicate instead of stacking
        tag: opts?.tag ?? key,
      };
      try {
        // Android forbids the `new Notification()` constructor in pages —
        // notifications must go through the service worker registration.
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
      } catch {
        try {
          const n = new Notification(title, options);
          n.onclick = () => { window.focus(); n.close(); };
        } catch (e) {
          console.warn("Notification failed:", e);
        }
      }
    },
    []
  );

  return { permission, supported, requestPermission, ensureSubscribed, notify };
}
