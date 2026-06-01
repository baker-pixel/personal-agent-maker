/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// Workbox injects the precache manifest here at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Allow the app to trigger a SW update (used by the UpdatePrompt component)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ─── Push notification handlers ───────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {}

  const title = data.title ?? "Normy";
  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: "/icon-192-v2.png",
    badge: "/favicon.png",
    tag: data.tag ?? "normy-general",
    data: { url: data.url ?? "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = (event.notification.data as any)?.url ?? "/";

  event.waitUntil(
    (self.clients as any)
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins: WindowClient[]) => {
        for (const w of wins) {
          if (w.url.startsWith(self.location.origin) && "focus" in w) {
            w.navigate(url);
            return w.focus();
          }
        }
        if ((self.clients as any).openWindow) {
          return (self.clients as any).openWindow(url);
        }
      })
  );
});
