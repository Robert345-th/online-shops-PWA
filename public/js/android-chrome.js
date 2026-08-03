(function () {
  const REDIRECT_KEY = "zm_chrome_redirect";
  const NO_AUTO_REDIRECT = [
    "/install.html",
    "/download.html",
    "/login.html",
    "/signup.html",
    "/verify-otp.html",
    "/forgot-password.html",
    "/register-shop.html",
    "/chat-room.html",
    "/chat-list.html",
  ];

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches
    );
  }

  function isPlayStoreApp() {
    if (isStandalone()) return true;
    const ref = document.referrer || "";
    if (/^android-app:\/\/app\.zedmarket\.twa/i.test(ref)) return true;
    if (/[?&]utm_source=(android|pwa)\b/i.test(location.search)) return true;
    return false;
  }

  function isSamsungBrowser() {
    return /SamsungBrowser/i.test(navigator.userAgent);
  }

  function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat/i.test(navigator.userAgent);
  }

  function isEmbeddedBrowser() {
    if (isStandalone()) return false;
    if (isInAppBrowser()) return true;
    if (/[?&]fbclid=/i.test(location.search)) return true;
    const ref = document.referrer || "";
    if (/facebook\.com|instagram\.com|fb\.me|messenger\.com|twitter\.com|t\.co|linkedin\.com|whatsapp\.com/i.test(ref)) {
      return true;
    }
    if (isAndroid() && /;\s*wv\)|\bwv\b/i.test(navigator.userAgent)) return true;
    return false;
  }

  function isAndroidChrome() {
    const ua = navigator.userAgent;
    if (!isAndroid()) return false;
    if (/SamsungBrowser|EdgA|OPR|Firefox|UCBrowser|MiuiBrowser/i.test(ua)) return false;
    if (/wv\)|;\s*wv\s|WebView/i.test(ua)) return false;
    if (isInAppBrowser()) return false;
    return /Chrome\/\d+/i.test(ua);
  }

  function isInstallPage() {
    const path = location.pathname.toLowerCase();
    return path === "/install.html" || path.endsWith("/install.html");
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

  function getHttpsUrl() {
    return `${location.protocol}//${location.host}${location.pathname}${location.search}`;
  }

  function buildChromeIntentUrl() {
    const httpsUrl = getHttpsUrl();
    const pathPart = `${location.host}${location.pathname}${location.search}`;
    return (
      `intent://${pathPart}#Intent;` +
      "scheme=https;" +
      "action=android.intent.action.VIEW;" +
      "category=android.intent.category.BROWSABLE;" +
      "package=com.android.chrome;" +
      `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};` +
      "end"
    );
  }

  function goToInstallHelp() {
    if (!isInstallPage()) {
      window.location.href = "/install.html";
    }
  }

  function openInChrome() {
    if (isEmbeddedBrowser()) {
      goToInstallHelp();
      return;
    }
    const httpsUrl = getHttpsUrl();
    const intentUrl = buildChromeIntentUrl();

    if (isSamsungBrowser() || /Samsung/i.test(navigator.userAgent)) {
      window.location.href = `googlechrome://navigate?url=${encodeURIComponent(httpsUrl)}`;
      setTimeout(() => {
        window.location.replace(intentUrl);
      }, 700);
      return;
    }

    window.location.replace(intentUrl);
  }

  function needsChromeOnAndroid() {
    return isAndroid() && !isStandalone() && !isAndroidChrome();
  }

  function maybeRedirectToChrome() {
    if (isPlayStoreApp()) return;
    if (isStandalone() || isInstallPage() || isEmbeddedBrowser()) return;
    if (!needsChromeOnAndroid()) return;
    if (isBlockedPath()) return;
    if (isLoggedIn()) return;
    const stamp = `${location.pathname}${location.search}`;
    if (sessionStorage.getItem(REDIRECT_KEY) === stamp) return;
    sessionStorage.setItem(REDIRECT_KEY, stamp);
    openInChrome();
  }

  window.isPlayStoreApp = isPlayStoreApp;
  window.openInChrome = openInChrome;
  window.buildChromeIntentUrl = buildChromeIntentUrl;
  window.isAndroidChrome = isAndroidChrome;
  window.isInAppBrowser = isInAppBrowser;
  window.isEmbeddedBrowser = isEmbeddedBrowser;
  window.needsChromeOnAndroid = needsChromeOnAndroid;
  window.showInAppBrowserGuide = goToInstallHelp;
  window.goToInstallHelp = goToInstallHelp;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeRedirectToChrome);
  } else {
    maybeRedirectToChrome();
  }
})();
