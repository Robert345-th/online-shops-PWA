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
