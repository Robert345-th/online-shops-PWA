const CACHE_NAME = "zedmarket-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: on every GET request, immediately return
// whatever is already cached (so a repeat visit to a page - like tapping
// back into a chat - loads instantly, same as the browser's own
// back/forward cache does), while at the same time fetching a fresh copy
// in the background and saving it for next time. This makes ANY repeat
// navigation feel instant, not just the browser back button, without ever
// showing permanently stale content - each visit always kicks off an
// update for the visit after it.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Don't cache API calls to Railway - chat messages, listings, etc. must
  // always be fetched live, never served stale from cache.
  if (event.request.url.includes("railway.app")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      // Return the cached version immediately if we have one; otherwise
      // wait for the network (first-ever visit to a page has no cache yet).
      return cached || networkFetch;
    })
  );
});
