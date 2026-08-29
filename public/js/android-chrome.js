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
    if (window.__zmPlayStoreApp === true) return true;
    if (typeof window.ZedMarketLocation !== "undefined") return true;
    if (isStandalone()) return true;
    const ref = document.referrer || "";
    if (/^android-app:\/\/app\.zedmarket\.twa/i.test(ref)) return true;
    if (/[?&]utm_source=(android|pwa)\b/i.test(location.search)) return true;
    if (isAndroid() && /ZedMarketApp|;\s*wv\)|\bwv\b/i.test(navigator.userAgent)) return true;
    return false;
  }

  function isAndroidWebView() {
    return isAndroid() && /;\s*wv\)|\bwv\b|WebView/i.test(navigator.userAgent);
  }

  function registerPlayStoreServiceWorker() {
    if (!isPlayStoreApp() || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  function applyPlayStoreWebViewInsets() {
    if (!isPlayStoreApp() || !isAndroidWebView()) return;
    document.documentElement.classList.add("play-store-webview");
    if (document.getElementById("play-store-webview-insets")) return;
    const style = document.createElement("style");
    style.id = "play-store-webview-insets";
    style.textContent = `
      html.play-store-webview {
        --ps-top-inset: env(safe-area-inset-top, 0px);
        --ps-overlay-top: max(env(safe-area-inset-top, 0px), 28px);
        --ps-bottom-inset: max(env(safe-area-inset-bottom, 0px), 48px);
      }
      html.play-store-webview.play-store-immersive {
        --ps-bottom-inset: env(safe-area-inset-bottom, 0px);
      }
      html.play-store-webview .topbar {
        padding-top: calc(12px + var(--ps-top-inset));
      }
      html.play-store-webview #composerDock {
        padding-bottom: calc(12px + var(--ps-bottom-inset));
      }
      html.play-store-webview body.keyboard-open #composerDock {
        padding-bottom: 8px;
      }
      html.play-store-webview .menu-box {
        padding-bottom: calc(24px + var(--ps-bottom-inset));
      }
      html.play-store-webview .sticky-header {
        padding-top: 0;
      }
      html.play-store-webview .hero-wrap .round-btn,
      html.play-store-webview .hero-wrap .hero-actions {
        top: calc(14px + var(--ps-top-inset));
      }
      html.play-store-webview .listing-shell .hero-wrap .round-btn {
        top: 8px;
      }
      html.play-store-webview .viewer-back {
        top: calc(40px + var(--ps-overlay-top));
      }
      html.play-store-webview .camera-modal {
        padding-top: calc(16px + var(--ps-overlay-top));
      }
      html.play-store-webview .preview-overlay .preview-close-btn {
        top: calc(50px + var(--ps-overlay-top));
      }
      html.play-store-webview .bottom-nav {
        padding-bottom: max(6px, var(--ps-bottom-inset));
      }
      html.play-store-webview .fab {
        bottom: calc(72px + var(--ps-bottom-inset));
      }
    `;
    document.head.appendChild(style);
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

  function isHomePath() {
    const p = (location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/" || p === "/index.html";
  }

  function closeOpenOverlay() {
    const open = document.querySelectorAll(
      ".viewer-overlay.open, .modal-overlay.open, .camera-modal.open, .preview-overlay.open, #menuOverlay.open, #settingsOverlay.open, #messageActionsOverlay.open, #callConfirmOverlay.open, #chatPrefOverlay.open"
    );
    if (!open.length) return false;
    open[open.length - 1].classList.remove("open");
    return true;
  }

  window.__zmHandleBack = function () {
    if (closeOpenOverlay()) return true;
    if (isHomePath()) return false;
    try {
      const ref = document.referrer || "";
      if (ref.indexOf(location.origin) === 0) {
        history.back();
        return true;
      }
    } catch (e) {}
    location.href = "/index.html";
    return true;
  };

  window.isPlayStoreApp = isPlayStoreApp;
  window.isAndroidWebView = isAndroidWebView;
  window.openInChrome = openInChrome;
  window.buildChromeIntentUrl = buildChromeIntentUrl;
  window.isAndroidChrome = isAndroidChrome;
  window.isInAppBrowser = isInAppBrowser;
  window.isEmbeddedBrowser = isEmbeddedBrowser;
  window.needsChromeOnAndroid = needsChromeOnAndroid;
  window.showInAppBrowserGuide = goToInstallHelp;
  window.goToInstallHelp = goToInstallHelp;

  applyPlayStoreWebViewInsets();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      registerPlayStoreServiceWorker();
      applyPlayStoreWebViewInsets();
      maybeRedirectToChrome();
    });
  } else {
    registerPlayStoreServiceWorker();
    applyPlayStoreWebViewInsets();
    maybeRedirectToChrome();
  }
})();
