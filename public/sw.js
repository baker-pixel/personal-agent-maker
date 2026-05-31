self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const title = data.title ?? 'Normy';
  const options = {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/favicon.png',
    tag: data.tag ?? 'normy-general',
    data: { url: data.url ?? '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.startsWith(self.location.origin) && 'focus' in w) {
            w.navigate(url);
            return w.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
