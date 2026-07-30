(function () {
  const REDIRECT_KEY = "zm_chrome_redirect";
  const INAPP_GUIDE_DISMISS_KEY = "zm_inapp_install_guide_dismissed";
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

  function isSamsungBrowser() {
    return /SamsungBrowser/i.test(navigator.userAgent);
  }

  function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat/i.test(navigator.userAgent);
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isAndroidChrome() {
    const ua = navigator.userAgent;
    if (!isAndroid()) return false;
    if (/SamsungBrowser|EdgA|OPR|Firefox|UCBrowser|MiuiBrowser/i.test(ua)) return false;
    if (/wv\)|;\s*wv\s|WebView/i.test(ua)) return false;
    if (isInAppBrowser()) return false;
    return /Chrome\/\d+/i.test(ua);
  }

  function t(key, fallback) {
    return typeof window.t === "function" ? window.t(key) : fallback;
  }

  function ensureInAppGuideModal() {
    if (document.getElementById("inAppInstallGuide")) return;

    const modal = document.createElement("div");
    modal.id = "inAppInstallGuide";
    modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:300;align-items:flex-end;justify-content:center;padding:0 12px 12px;";
    modal.innerHTML = `
      <div style="background:#F4F1EC;width:100%;max-width:480px;border-radius:20px;padding:22px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 8px 32px rgba(0,0,0,0.35);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <img src="https://www.zedmarket.app/icon-192.png" alt="" width="48" height="48" style="border-radius:12px;flex-shrink:0;" />
          <div>
            <div style="font-size:17px;font-weight:700;color:#1A1A1A;" data-i18n="inapp_install_title">Install ZedMarket</div>
            <div style="font-size:12px;color:#6B6B66;margin-top:2px;" data-i18n="inapp_install_sub">Apps can't install inside Facebook — open in your browser first.</div>
          </div>
        </div>
        <div id="inAppInstallBody" style="font-size:14px;color:#1A1A1A;line-height:1.55;margin-bottom:18px;"></div>
        <button type="button" id="inAppOpenBrowserBtn" style="width:100%;background:#111;color:#F5C518;border:none;padding:13px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:10px;" data-i18n="inapp_open_browser_btn">Open in Chrome</button>
        <button type="button" id="inAppCopyLinkBtn" style="width:100%;background:transparent;color:#111;border:1.5px solid rgba(17,17,17,0.2);padding:12px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:10px;" data-i18n="inapp_copy_link_btn">Copy link — open in browser</button>
        <button type="button" id="inAppGuideDismissBtn" style="width:100%;background:none;border:none;color:#6B6B66;font-size:13px;cursor:pointer;padding:8px;" data-i18n="inapp_continue_browsing">Continue browsing</button>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideInAppBrowserGuide(true);
    });
    document.getElementById("inAppOpenBrowserBtn").addEventListener("click", () => {
      if (isIOS()) {
        document.getElementById("inAppCopyLinkBtn").click();
        return;
      }
      openInChrome();
    });
    document.getElementById("inAppCopyLinkBtn").addEventListener("click", async () => {
      const url = getHttpsUrl();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          throw new Error("clipboard unavailable");
        }
      } catch {
        prompt(t("inapp_copy_link_prompt", "Copy this link and paste it in Chrome or Safari:"), url);
        return;
      }
      alert(t("inapp_link_copied", "Link copied! Paste it in Chrome or Safari, then install the app."));
    });
    document.getElementById("inAppGuideDismissBtn").addEventListener("click", () => hideInAppBrowserGuide(true));
  }

  function refreshInAppGuideContent() {
    const body = document.getElementById("inAppInstallBody");
    const openBtn = document.getElementById("inAppOpenBrowserBtn");
    if (!body || !openBtn) return;

    if (isIOS()) {
      body.setAttribute("data-i18n", "inapp_install_ios");
      body.textContent = t(
        "inapp_install_ios",
        'Tap the menu (⋯) at the top right of Facebook, choose "Open in browser" or "Open in Safari", then in Safari tap Share → "Add to Home Screen".'
      );
      openBtn.setAttribute("data-i18n", "inapp_open_safari_btn");
      openBtn.textContent = t("inapp_open_safari_btn", "How to open in Safari");
    } else {
      body.setAttribute("data-i18n", "inapp_install_android");
      body.textContent = t(
        "inapp_install_android",
        'Tap the menu (⋮) at the top right of Facebook and choose "Open in Chrome" or "Open in browser". Then tap Install App on ZedMarket.'
      );
      openBtn.setAttribute("data-i18n", "inapp_open_browser_btn");
      openBtn.textContent = t("inapp_open_browser_btn", "Open in Chrome");
    }

    if (typeof applyTranslations === "function") {
      applyTranslations(document.getElementById("inAppInstallGuide"));
    }
  }

  function showInAppBrowserGuide() {
    if (isStandalone() || localStorage.getItem(INAPP_GUIDE_DISMISS_KEY) === "1") return;
    ensureInAppGuideModal();
    refreshInAppGuideContent();
    const modal = document.getElementById("inAppInstallGuide");
    modal.style.display = "flex";
  }

  function hideInAppBrowserGuide(remember) {
    const modal = document.getElementById("inAppInstallGuide");
    if (modal) modal.style.display = "none";
    if (remember) localStorage.setItem(INAPP_GUIDE_DISMISS_KEY, "1");
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

  function openInChrome() {
    const httpsUrl = getHttpsUrl();
    const intentUrl = buildChromeIntentUrl();

    // Opens Chrome directly on Samsung — skips the "Open with" chooser
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
    if (isStandalone()) return;
    if (isInAppBrowser()) {
      showInAppBrowserGuide();
      return;
    }
    if (!needsChromeOnAndroid()) return;
    if (isBlockedPath()) return;
    if (isLoggedIn()) return;
    const stamp = `${location.pathname}${location.search}`;
    if (sessionStorage.getItem(REDIRECT_KEY) === stamp) return;
    sessionStorage.setItem(REDIRECT_KEY, stamp);
    openInChrome();
  }

  window.openInChrome = openInChrome;
  window.buildChromeIntentUrl = buildChromeIntentUrl;
  window.isAndroidChrome = isAndroidChrome;
  window.isInAppBrowser = isInAppBrowser;
  window.needsChromeOnAndroid = needsChromeOnAndroid;
  window.showInAppBrowserGuide = showInAppBrowserGuide;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeRedirectToChrome);
  } else {
    maybeRedirectToChrome();
  }
})();
