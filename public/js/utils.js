(function () {
  if (!document.querySelector('link[href="/css/dark-mode.css"]')) {
    const themeLink = document.createElement("link");
    themeLink.rel = "stylesheet";
    themeLink.href = "/css/dark-mode.css";
    document.head.appendChild(themeLink);
  }

  const API_URL = "https://online-shops-production.up.railway.app";
  const SESSION_POLL_MS = 4000;
  let sessionPollTimer = null;
  let forcingLogout = false;

  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clearAuth() {
    localStorage.removeItem("zm_token");
    localStorage.removeItem("zm_user");
  }

  function zmIsLoggedIn() {
    if (!localStorage.getItem("zm_token")) return false;
    try {
      const user = JSON.parse(localStorage.getItem("zm_user") || "null");
      return !!(user && typeof user === "object");
    } catch (e) {
      return false;
    }
  }

  function zmLoginUrl(nextPath) {
    const next = nextPath || (location.pathname + location.search);
    return `/login.html?next=${encodeURIComponent(next)}`;
  }

  function zmRequireLogin(nextPath) {
    if (zmIsLoggedIn()) return true;
    location.href = zmLoginUrl(nextPath);
    return false;
  }

  function forceLogoutSuspended(message) {
    if (forcingLogout) return;
    forcingLogout = true;
    stopSessionWatch();
    clearAuth();
    try {
      sessionStorage.setItem(
        "zm_logout_reason",
        message || "Your account has been suspended. Contact support."
      );
    } catch (e) {}
    if (!/login\.html/i.test(location.pathname)) {
      location.href = "/login.html?suspended=1";
    } else {
      forcingLogout = false;
    }
  }

  async function responseIsSuspended(res) {
    if (!res || res.status !== 403) return false;
    if (res.headers && res.headers.get("X-Account-Suspended") === "1") return true;
    try {
      const data = await res.clone().json();
      return !!(data && data.suspended);
    } catch (e) {
      return false;
    }
  }

  function handleAuthResponse(res) {
    if (!res) return true;
    if (res.status === 401) {
      clearAuth();
      if (!/login\.html/i.test(location.pathname)) {
        location.href = "/login.html";
      }
      return false;
    }
    if (res.status === 403) {
      if (res.headers && res.headers.get("X-Account-Suspended") === "1") {
        forceLogoutSuspended("Your account has been suspended. Contact support.");
        return false;
      }
      responseIsSuspended(res).then((suspended) => {
        if (suspended) forceLogoutSuspended("Your account has been suspended. Contact support.");
      });
    }
    return true;
  }

  async function checkSessionOnce() {
    const token = localStorage.getItem("zm_token");
    if (!token) {
      stopSessionWatch();
      return;
    }
    try {
      const res = await fetch(`${API_URL}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        clearAuth();
        if (!/login\.html/i.test(location.pathname)) location.href = "/login.html";
        return;
      }
      if (await responseIsSuspended(res)) {
        forceLogoutSuspended("Your account has been suspended. Contact support.");
      }
    } catch (e) {
      /* offline — try again on next poll */
    }
  }

  function startSessionWatch() {
    if (sessionPollTimer || !localStorage.getItem("zm_token")) return;
    if (/login\.html|signup\.html|verify-otp\.html|forgot-password\.html/i.test(location.pathname)) {
      return;
    }
    checkSessionOnce();
    sessionPollTimer = setInterval(checkSessionOnce, SESSION_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkSessionOnce();
    });
  }

  function stopSessionWatch() {
    if (sessionPollTimer) {
      clearInterval(sessionPollTimer);
      sessionPollTimer = null;
    }
  }

  function installFetchAuthGuard() {
    if (window.__zmFetchGuard) return;
    window.__zmFetchGuard = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const res = await origFetch(input, init);
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const isApi =
        /online-shops-production\.up\.railway\.app/i.test(url) ||
        (url.startsWith("/") && url.includes("/api/"));
      if (!isApi || !localStorage.getItem("zm_token")) return res;

      if (res.status === 401) {
        clearAuth();
        if (!/login\.html/i.test(location.pathname)) location.href = "/login.html";
        return res;
      }
      if (res.status === 403 && (await responseIsSuspended(res))) {
        forceLogoutSuspended("Your account has been suspended. Contact support.");
      }
      return res;
    };
  }

  function registerSiteServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "force_logout") {
        forceLogoutSuspended(
          event.data.message || "Your account has been suspended. Contact support."
        );
      }
    });
  }

  window.escHtml = escHtml;
  window.clearAuth = clearAuth;
  window.zmIsLoggedIn = zmIsLoggedIn;
  window.zmRequireLogin = zmRequireLogin;
  window.zmLoginUrl = zmLoginUrl;
  window.handleAuthResponse = handleAuthResponse;
  window.forceLogoutSuspended = forceLogoutSuspended;
  window.startSessionWatch = startSessionWatch;
  window.stopSessionWatch = stopSessionWatch;
  window.ZM_API_URL = API_URL;

  installFetchAuthGuard();
  registerSiteServiceWorker();

  /* ── Faster navigation: preconnect, loading bar, prefetch ── */
  if (!document.querySelector('link[rel="preconnect"][href*="railway"]')) {
    const pc = document.createElement("link");
    pc.rel = "preconnect";
    pc.href = API_URL;
    pc.crossOrigin = "anonymous";
    document.head.appendChild(pc);
  }

  (function initNavSpeed() {
    if (window.__zmNavSpeed) return;
    window.__zmNavSpeed = true;

    const style = document.createElement("style");
    style.textContent = `
      #zm-nav-bar {
        position: fixed; top: 0; left: 0; height: 3px;
        background: var(--orange, #FF7A1A); z-index: 99999;
        width: 0; pointer-events: none;
        transition: width 0.25s ease;
      }
      body.zm-nav-loading #zm-nav-bar { width: 75%; }
      body.zm-nav-done #zm-nav-bar { width: 100%; opacity: 0; transition: width 0.15s, opacity 0.3s 0.1s; }
    `;
    document.head.appendChild(style);
    const bar = document.createElement("div");
    bar.id = "zm-nav-bar";
    document.documentElement.appendChild(bar);

    const prefetched = new Set();
    function prefetchUrl(url) {
      if (!url || prefetched.has(url)) return;
      let path = url;
      try {
        const u = new URL(url, location.origin);
        if (u.origin !== location.origin) return;
        path = u.pathname + u.search;
      } catch (e) { return; }
      prefetched.add(path);
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = path;
      document.head.appendChild(link);
    }

    window.zmShowNavLoading = function () {
      document.body.classList.add("zm-nav-loading");
      document.body.classList.remove("zm-nav-done");
    };

    window.zmPrefetchListing = function (id, data) {
      try {
        sessionStorage.setItem("zm_listing_" + id, JSON.stringify({ ts: Date.now(), data }));
      } catch (e) {}
      prefetchUrl("/listing.html?id=" + id);
      if (!prefetched.has("api:" + id)) {
        prefetched.add("api:" + id);
        fetch(`${API_URL}/listings/${id}`).catch(() => {});
      }
    };

    window.zmGetCachedListing = function (id) {
      try {
        const raw = sessionStorage.getItem("zm_listing_" + id);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || Date.now() - parsed.ts > 10 * 60 * 1000) return null;
        return parsed.data;
      } catch (e) {
        return null;
      }
    };

    document.addEventListener("touchstart", (e) => {
      const a = e.target.closest("a[href]");
      if (a && !a.target && a.origin === location.origin) prefetchUrl(a.href);
    }, { passive: true });

    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (a && !a.target && !e.defaultPrevented && a.origin === location.origin) {
        window.zmShowNavLoading();
      }
    }, true);

    window.addEventListener("pageshow", () => {
      document.body.classList.remove("zm-nav-loading");
      document.body.classList.add("zm-nav-done");
      setTimeout(() => document.body.classList.remove("zm-nav-done"), 400);
    });
  })();

  function deferSessionWatch() {
    const start = () => setTimeout(startSessionWatch, 150);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }
  deferSessionWatch();
})();
