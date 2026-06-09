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

  // Fallback: direct browser notification while tab is open
  const notify = useCallback(
    (title: string, body: string, _key: string, opts?: { tag?: string }) => {
      if (!supported || Notification.permission !== "granted") return;
      try {
        const n = new Notification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/favicon.png",
          tag: opts?.tag,
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) {
        console.warn("Notification failed:", e);
      }
    },
    []
  );

  return { permission, supported, requestPermission, ensureSubscribed, notify };
}
