(function () {
  const REDIRECT_KEY = "zm_chrome_redirect";
  const NO_AUTO_REDIRECT = [
    "/login.html",
    "/signup.html",
    "/verify-otp.html",
    "/forgot-password.html",
    "/shop-signup.html",
    "/register-shop.html",
    "/chat-room.html",
    "/chat-list.html",
  ];

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches;
  }

  function isAndroidChrome() {
    const ua = navigator.userAgent;
    if (!isAndroid()) return false;
    if (/SamsungBrowser|EdgA|OPR|Firefox|UCBrowser|MiuiBrowser/i.test(ua)) return false;
    if (/wv\)|;\s*wv\s|WebView/i.test(ua)) return false;
    if (/FBAN|FBAV|Instagram|Line\//i.test(ua)) return false;
    return /Chrome\/\d+/i.test(ua);
  }

  function isLoggedIn() {
    try {
      const user = JSON.parse(localStorage.getItem("zm_user") || "null");
      return !!(user && localStorage.getItem("zm_token"));
    } catch {
      return false;
    }
  }

  function isBlockedPath() {
    const path = location.pathname.toLowerCase();
    return NO_AUTO_REDIRECT.some((p) => path === p || path.endsWith(p));
  }

  function buildChromeIntentUrl() {
    return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  function openInChrome() {
    window.location.replace(buildChromeIntentUrl());
  }

  function needsChromeOnAndroid() {
    return isAndroid() && !isStandalone() && !isAndroidChrome();
  }

  function maybeRedirectToChrome() {
    if (!needsChromeOnAndroid()) return;
    if (isBlockedPath()) return;
    if (isLoggedIn()) return;
    const stamp = `${location.pathname}${location.search}`;
    if (sessionStorage.getItem(REDIRECT_KEY) === stamp) return;
    sessionStorage.setItem(REDIRECT_KEY, stamp);
    openInChrome();
  }

  window.openInChrome = openInChrome;
  window.isAndroidChrome = isAndroidChrome;
  window.needsChromeOnAndroid = needsChromeOnAndroid;

  maybeRedirectToChrome();
})();
