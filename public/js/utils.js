(function () {
  if (!document.querySelector('link[href="/css/dark-mode.css"]')) {
    const themeLink = document.createElement("link");
    themeLink.rel = "stylesheet";
    themeLink.href = "/css/dark-mode.css";
    document.head.appendChild(themeLink);
  }

  const API_URL = "https://online-shops-production.up.railway.app";
  const SESSION_POLL_MS = 45000;
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

  function zmPriceDrop(item) {
    const now = Number(item && item.price);
    const was = Number(item && item.compare_at_price);
    if (!Number.isFinite(now) || !Number.isFinite(was) || was <= 0 || now >= was) return null;
    const pct = Math.max(1, Math.round(((was - now) / was) * 100));
    return { pct, was };
  }

  function zmDropChipHtml(item) {
    const drop = zmPriceDrop(item);
    return drop ? `<div class="drop-chip">-${drop.pct}%</div>` : "";
  }

  function zmDropPriceHtml(item) {
    const drop = zmPriceDrop(item);
    if (!drop) return "";
    return `<span class="drop-pct">-${drop.pct}%</span><span class="was-price">K${Math.round(drop.was)}</span>`;
  }

  if (!document.getElementById("zm-drop-css")) {
    const dropCss = document.createElement("style");
    dropCss.id = "zm-drop-css";
    dropCss.textContent = `
      .drop-chip {
        position: absolute; right: 8px; bottom: 8px; z-index: 3;
        background: #E01B27; color: #fff; font-size: 11px; font-weight: 800;
        padding: 3px 7px; border-radius: 4px; letter-spacing: 0.02em; line-height: 1.2;
      }
      .drop-pct {
        display: inline-block; background: #E01B27; color: #fff;
        font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 4px;
        margin-left: 6px; vertical-align: middle; letter-spacing: 0.02em;
      }
      .was-price {
        margin-left: 8px; font-size: 11px; font-weight: 600;
        color: var(--subtext, #5C5955); text-decoration: line-through;
      }
      .photo-price .drop-pct { font-size: 14px; padding: 3px 8px; }
      .photo-price .was-price { color: #ddd; font-size: 14px; }
    `;
    document.head.appendChild(dropCss);
  }

  function syncNativeAuth() {
    try {
      if (window.ZedMarketLocation && typeof window.ZedMarketLocation.saveAuthToken === "function") {
        window.ZedMarketLocation.saveAuthToken(localStorage.getItem("zm_token") || "");
      }
    } catch (e) {}
  }

  const ACCOUNT_PREF_KEYS = {
    zm_lang: "lang",
    zm_dark_mode: "dark_mode",
    zm_low_data: "low_data",
    zm_home_location: "home_location",
    zm_user_location_label: "location_label",
    zm_listing_draft: "listing_draft",
    zm_sold_templates: "sold_templates",
    zm_selling_type: "selling_type",
    zm_shop_city: "shop_city",
    zm_shop_province: "shop_province",
    zm_shop_location_label: "shop_location_label",
    zm_home_selling_label: "home_selling_label",
  };
  const JSON_PREF_KEYS = {
    zm_home_location: true,
    zm_listing_draft: true,
    zm_sold_templates: true,
  };
  const LOGOUT_PREF_KEYS = [
    "zm_home_location",
    "zm_user_location_label",
    "zm_listing_draft",
    "zm_sold_templates",
    "zm_selling_type",
    "zm_shop_city",
    "zm_shop_province",
    "zm_shop_location_label",
    "zm_home_selling_label",
  ];

  let applyingAccountPrefs = false;
  let prefsPushTimer = null;
  let prefsPushPending = {};
  let prefsLoadInflight = null;

  function prefsAreEmpty(prefs) {
    if (!prefs || typeof prefs !== "object") return true;
    return !Object.keys(prefs).some((key) => prefs[key] != null && prefs[key] !== "");
  }

  function parsePrefLocalValue(lsKey, value) {
    if (value == null) return null;
    if (!JSON_PREF_KEYS[lsKey]) return String(value);
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  function zmCollectLocalPrefs() {
    const out = {};
    Object.keys(ACCOUNT_PREF_KEYS).forEach((lsKey) => {
      const raw = localStorage.getItem(lsKey);
      if (raw == null || raw === "") return;
      const parsed = parsePrefLocalValue(lsKey, raw);
      if (parsed == null) return;
      out[ACCOUNT_PREF_KEYS[lsKey]] = parsed;
    });
    return out;
  }

  function zmApplyAccountPrefs(prefs) {
    if (!prefs || typeof prefs !== "object") return;
    applyingAccountPrefs = true;
    try {
      if (prefs.lang) localStorage.setItem("zm_lang", prefs.lang);
      if (prefs.dark_mode === "true" || prefs.dark_mode === "false") {
        localStorage.setItem("zm_dark_mode", prefs.dark_mode);
        document.body.classList.toggle("dark", prefs.dark_mode === "true");
      }
      if (prefs.low_data === "true" || prefs.low_data === "false") {
        localStorage.setItem("zm_low_data", prefs.low_data);
        document.body.classList.toggle("low-data", prefs.low_data === "true");
      }
      const simple = {
        location_label: "zm_user_location_label",
        selling_type: "zm_selling_type",
        shop_city: "zm_shop_city",
        shop_province: "zm_shop_province",
        shop_location_label: "zm_shop_location_label",
        home_selling_label: "zm_home_selling_label",
      };
      Object.keys(simple).forEach((apiKey) => {
        if (!Object.prototype.hasOwnProperty.call(prefs, apiKey)) return;
        if (prefs[apiKey] == null || prefs[apiKey] === "") localStorage.removeItem(simple[apiKey]);
        else localStorage.setItem(simple[apiKey], String(prefs[apiKey]));
      });
      Object.keys(JSON_PREF_KEYS).forEach((lsKey) => {
        const apiKey = ACCOUNT_PREF_KEYS[lsKey];
        if (!Object.prototype.hasOwnProperty.call(prefs, apiKey)) return;
        if (prefs[apiKey] == null) localStorage.removeItem(lsKey);
        else localStorage.setItem(lsKey, JSON.stringify(prefs[apiKey]));
      });
    } finally {
      applyingAccountPrefs = false;
    }
    if (prefs.lang && typeof window.setLangAndApply === "function") {
      applyingAccountPrefs = true;
      try {
        window.setLangAndApply(prefs.lang);
      } finally {
        applyingAccountPrefs = false;
      }
    }
    if (typeof window.setLowData === "function" && (prefs.low_data === "true" || prefs.low_data === "false")) {
      applyingAccountPrefs = true;
      try {
        window.setLowData(prefs.low_data === "true");
      } finally {
        applyingAccountPrefs = false;
      }
    }
    window.dispatchEvent(new Event("zmprefsapplied"));
  }

  async function zmPushAccountPrefsNow(patch) {
    const token = localStorage.getItem("zm_token");
    if (!token || !patch || !Object.keys(patch).length) return;
    try {
      await fetch(`${API_URL}/auth/prefs`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
    } catch (e) { /* offline */ }
  }

  function zmPushAccountPrefs(patch) {
    if (!localStorage.getItem("zm_token") || applyingAccountPrefs) return;
    if (!patch || !Object.keys(patch).length) return;
    prefsPushPending = Object.assign(prefsPushPending, patch);
    clearTimeout(prefsPushTimer);
    prefsPushTimer = setTimeout(() => {
      const body = prefsPushPending;
      prefsPushPending = {};
      zmPushAccountPrefsNow(body);
    }, 600);
  }

  function zmQueuePrefFromLocal(lsKey, value, removed) {
    const apiKey = ACCOUNT_PREF_KEYS[lsKey];
    if (!apiKey || applyingAccountPrefs || !localStorage.getItem("zm_token")) return;
    const patch = {};
    patch[apiKey] = removed ? null : parsePrefLocalValue(lsKey, value);
    zmPushAccountPrefs(patch);
  }

  function zmLoadAccountPrefs() {
    if (prefsLoadInflight) return prefsLoadInflight;
    prefsLoadInflight = (async () => {
      const token = localStorage.getItem("zm_token");
      if (!token) return;
      try {
        const res = await Promise.race([
          fetch(`${API_URL}/auth/prefs`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
        ]);
        if (!res.ok) return;
        const data = await res.json();
        const prefs = data.prefs || {};
        if (prefsAreEmpty(prefs)) {
          const local = zmCollectLocalPrefs();
          if (Object.keys(local).length) await zmPushAccountPrefsNow(local);
          return;
        }
        zmApplyAccountPrefs(prefs);
      } catch (e) { /* offline — keep local copy */ }
    })().finally(() => {
      prefsLoadInflight = null;
    });
    return prefsLoadInflight;
  }

  function zmApplyLoginPrefs(prefs) {
    if (prefs && !prefsAreEmpty(prefs)) {
      zmApplyAccountPrefs(prefs);
      return;
    }
    const local = zmCollectLocalPrefs();
    if (Object.keys(local).length) zmPushAccountPrefsNow(local);
  }

  function clearAuth() {
    localStorage.removeItem("zm_token");
    localStorage.removeItem("zm_user");
    localStorage.removeItem("zm_recent_listings");
    localStorage.removeItem("recentlyViewed");
    localStorage.removeItem("zm_recent_migrated");
    LOGOUT_PREF_KEYS.forEach((key) => localStorage.removeItem(key));
    syncNativeAuth();
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

  function zmSignupUrl(nextPath) {
    const next = nextPath || (location.pathname + location.search);
    return `/signup.html?next=${encodeURIComponent(next)}`;
  }

  function zmSafeNext(raw) {
    const value = String(raw || "");
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/index.html";
    return value;
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
  window.zmApplyAccountPrefs = zmApplyAccountPrefs;
  window.zmApplyLoginPrefs = zmApplyLoginPrefs;
  window.zmPushAccountPrefs = zmPushAccountPrefs;
  window.zmLoadAccountPrefs = zmLoadAccountPrefs;
  window.zmPriceDrop = zmPriceDrop;
  window.zmDropChipHtml = zmDropChipHtml;
  window.zmDropPriceHtml = zmDropPriceHtml;
  window.zmIsLoggedIn = zmIsLoggedIn;
  window.zmRequireLogin = zmRequireLogin;
  window.zmLoginUrl = zmLoginUrl;
  window.zmSignupUrl = zmSignupUrl;
  window.zmSafeNext = zmSafeNext;
  window.handleAuthResponse = handleAuthResponse;
  window.forceLogoutSuspended = forceLogoutSuspended;
  window.startSessionWatch = startSessionWatch;
  window.stopSessionWatch = stopSessionWatch;
  window.ZM_API_URL = API_URL;

  installFetchAuthGuard();
  registerSiteServiceWorker();
  syncNativeAuth();
  try {
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      origSet(key, value);
      if (key === "zm_token") syncNativeAuth();
      zmQueuePrefFromLocal(key, value, false);
    };
    const origRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key) {
      origRemove(key);
      if (key === "zm_token") syncNativeAuth();
      zmQueuePrefFromLocal(key, null, true);
    };
  } catch (e) {}

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

    window.zmPrefetchListing = function (id) {
      prefetchUrl("/listing.html?id=" + id);
      if (!prefetched.has("api:" + id)) {
        prefetched.add("api:" + id);
        fetch(`${API_URL}/listings/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((full) => {
            if (!full || !full.id) return;
            try {
              sessionStorage.setItem("zm_listing_" + id, JSON.stringify({ ts: Date.now(), data: full }));
            } catch (e) {}
          })
          .catch(() => {});
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

  if (/login\.html|signup\.html|verify-otp\.html|forgot-password\.html/i.test(location.pathname)) {
    window.zmPrefsReady = Promise.resolve();
  } else {
    window.zmPrefsReady = zmLoadAccountPrefs();
  }
})();
