/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

// Take immediate control of all open tabs when this SW activates.
// Without this, old tabs keep using the old SW until they reload.
clientsClaim();

// Workbox injects the precache manifest here at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// On activate: nuke ALL non-Workbox caches left behind by old SW versions.
// This clears old Workbox caches AND any stale runtime caches so clients
// always fetch fresh files after an update.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith("workbox-precache"))
          .map((k) => caches.delete(k))
      )
    )
  );
});

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
