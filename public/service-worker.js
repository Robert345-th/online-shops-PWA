// Minimal service worker - copied from the working Trade Tracker pattern.
// No page caching/precaching step, on purpose: that was found to cause a
// real regression (a stale cached version of a page could get stuck and
// keep being served indefinitely, even after redeploying a fix). Simplicity
// and reliability win here over a marginal repeat-visit speed gain.
//
// The activate handler also actively deletes any caches left behind by the
// previous version of this file, so anyone who already picked up the
// caching version gets cleaned up automatically and stops seeing stale pages.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'ZedMarket',
    body: '',
    url: '/chat-list.html',
    icon: 'https://www.zedmarket.app/icon-192.png',
    tag: 'zedmarket',
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/chat-list.html';
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) return client.navigate(absoluteUrl).then(() => client.focus());
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(absoluteUrl);
    })
  );
});
