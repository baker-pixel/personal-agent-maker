import { useState, useCallback } from "react";

const STORE_KEY = "normy_push_sent";

function getSentStore(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}

function saveSentStore(store: Record<string, number>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

function isAlreadySent(key: string): boolean {
  return !!getSentStore()[key];
}

function markSent(key: string) {
  const store = getSentStore();
  store[key] = Date.now();
  // Prune entries older than 7 days
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const k of Object.keys(store)) {
    if (store[k] < cutoff) delete store[k];
  }
  saveSentStore(store);
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export function usePushNotifications() {
  const supported = typeof Notification !== "undefined";

  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!supported) return "unsupported";
    return Notification.permission as PushPermission;
  });

  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (!supported) return "unsupported";
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      return result as PushPermission;
    } catch {
      return "denied";
    }
  }, [supported]);

  const notify = useCallback((
    title: string,
    body: string,
    key: string,
    options?: { icon?: string; tag?: string }
  ) => {
    if (!supported || Notification.permission !== "granted") return;
    if (isAlreadySent(key)) return;
    markSent(key);

    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: options?.tag || key,
        requireInteraction: false,
        ...options,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {
      console.warn("Push notification failed:", e);
    }
  }, [supported]);

  return { permission, supported, requestPermission, notify };
}
