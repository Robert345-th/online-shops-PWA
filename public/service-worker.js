const CACHE = "zedmarket-shell-v43";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/css/dark-mode.css",
  "/js/utils.js",
  "/js/android-chrome.js",
  "/js/app-touch.js",
  "/js/lang.js",
  "/js/bottom-nav.js",
  "/js/data-saver.js",
  "/index.html",
  "/my-shop.html",
  "/wanted.html",
  "/sale-confirmations.html",
  "/settings.html",
  "/listing.html",
  "/chat-list.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return request.method === "GET" && accept.includes("text/html");
}

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isHtmlPage(request) {
  const path = new URL(request.url).pathname;
  return path.endsWith(".html") || path === "/";
}

function isAppShell(request) {
  const path = new URL(request.url).pathname;
  return path.startsWith("/js/") || path.startsWith("/css/");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkFetch.catch(() => {});
    return cached;
  }

  const response = await networkFetch;
  if (response) return response;

  if (isNavigationRequest(request)) {
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
  }
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isSameOrigin(event.request)) return;

  if (isNavigationRequest(event.request) || isHtmlPage(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isAppShell(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  if (event.request.url.includes(OFFLINE_URL) || event.request.url.includes("/icon-")) {
    event.respondWith(cacheFirst(event.request));
  }
});

self.addEventListener("push", (event) => {
  let data = {
    title: "ZedMarket",
    body: "",
    url: "/chat-list.html",
    icon: "https://zedmarket.app/icon-192.png",
    tag: "zedmarket",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}

  const forceLogout = data.type === "force_logout";

  event.waitUntil((async () => {
    if (forceLogout) {
      const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        client.postMessage({
          type: "force_logout",
          message: data.body || "Your account has been suspended. Contact support.",
        });
      }
    }

    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,
      data: { url: data.url || (forceLogout ? "/login.html?suspended=1" : "/chat-list.html") },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chat-list.html";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client) return client.navigate(absoluteUrl).then(() => client.focus());
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(absoluteUrl);
    })
  );
});
