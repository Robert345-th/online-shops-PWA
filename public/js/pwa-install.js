(function () {
  const DISMISS_KEY = "zm_install_banner_dismissed";
  let deferredInstallPrompt = null;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
  }

  function hideInstallElements(ids) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const banner = document.getElementById("pwaInstallBanner");
    if (banner) banner.remove();
  }

  function ensureIosModal() {
    if (document.getElementById("iosInstallModal")) return;

    const modal = document.createElement("div");
    modal.id = "iosInstallModal";
    modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;align-items:flex-end;justify-content:center;";
    modal.innerHTML = `
      <div style="background:var(--bg,#F4F1EC);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom));">
        <div style="font-size:17px;font-weight:700;margin-bottom:8px;color:var(--text,#1A1A1A);" data-i18n="install_title">Install ZedMarket</div>
        <div style="font-size:13px;color:var(--subtext,#6B6B66);margin-bottom:18px;line-height:1.5;" data-i18n="install_ios_intro">
          iPhone can't install apps with one tap — but two taps in Safari is all it takes:
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--black,#111);color:var(--gold,#F5C518);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">1</div>
          <div style="font-size:14px;color:var(--text,#1A1A1A);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span data-i18n="install_ios_step1">Tap the Share button at the bottom of Safari</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--black,#111);color:var(--gold,#F5C518);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">2</div>
          <div style="font-size:14px;color:var(--text,#1A1A1A);" data-i18n="install_ios_step2">Scroll down and tap <strong>"Add to Home Screen"</strong></div>
        </div>
        <button type="button" id="iosInstallModalClose" style="width:100%;background:var(--black,#111);color:var(--gold,#F5C518);border:none;padding:13px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;" data-i18n="got_it">Got it</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
    document.getElementById("iosInstallModalClose").addEventListener("click", () => {
      modal.style.display = "none";
    });
    if (typeof applyTranslations === "function") applyTranslations(modal);
  }

  function showIosInstallGuide() {
    ensureIosModal();
    const modal = document.getElementById("iosInstallModal");
    modal.style.display = "flex";
    if (typeof applyTranslations === "function") applyTranslations(modal);
  }

  function buildChromeIntentUrl() {
    if (typeof window.buildChromeIntentUrl === "function") {
      return window.buildChromeIntentUrl();
    }
    const httpsUrl = `${location.protocol}//${location.host}${location.pathname}${location.search}`;
    const pathPart = `${location.host}${location.pathname}${location.search}`;
    return (
      `intent://${pathPart}#Intent;` +
      "scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;" +
      "package=com.android.chrome;" +
      `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
    );
  }

  function redirectToChrome() {
    if (typeof window.openInChrome === "function") {
      window.openInChrome();
      return;
    }
    window.location.replace(buildChromeIntentUrl());
  }

  const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.zedmarket.twa";

  async function promptPwaInstall() {
    // Android now always goes straight to the Play Store listing instead of
    // the PWA install flow (native prompt / Chrome redirect / manual
    // instructions) — the app is live on Play, so that's the real install
    // path for Android users now. This works from any browser/webview.
    if (isAndroid()) {
      window.location.href = PLAY_STORE_URL;
      return;
    }
    if (typeof window.isEmbeddedBrowser === "function" && window.isEmbeddedBrowser()) {
      if (typeof window.goToInstallHelp === "function") {
        window.goToInstallHelp();
        return;
      }
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    if (isIOS()) {
      showIosInstallGuide();
      return;
    }
    alert(typeof t === "function"
      ? t("install_desktop_hint")
      : 'To install: open in Chrome, then use the browser menu → "Install app" or "Add to Home screen".');
  }

  function showInstallBanner() {
    if (typeof window.isPlayStoreApp === "function" && window.isPlayStoreApp()) return;
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;
    if (document.getElementById("pwaInstallBanner")) return;

    const ios = isIOS();
    const android = isAndroid();
    if (!ios && !android) return;
    // Android now points straight to the Play Store, which works from any
    // browser/webview — so unlike iOS, embedded browsers don't need to be
    // filtered out here.
    if (!android && typeof window.isEmbeddedBrowser === "function" && window.isEmbeddedBrowser()) return;

    const banner = document.createElement("div");
    banner.id = "pwaInstallBanner";
    banner.style.cssText = [
      "position:fixed",
      "left:12px",
      "right:12px",
      "bottom:calc(68px + env(safe-area-inset-bottom))",
      "z-index:90",
      "background:#111",
      "color:#F5C518",
      "border-radius:14px",
      "padding:12px 14px",
      "display:flex",
      "align-items:center",
      "gap:10px",
      "box-shadow:0 4px 20px rgba(0,0,0,0.25)",
    ].join(";");
    banner.innerHTML = `
      <img src="https://zedmarket.app/icon-192.png" alt="" width="40" height="40" style="border-radius:10px;flex-shrink:0;" />
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:#fff;line-height:1.3;" data-i18n="${android ? "install_play_banner_text" : "install_banner_text"}">${android ? "Get ZedMarket on Google Play" : "Install ZedMarket on your home screen"}</div>
        <div style="font-size:11px;color:#C9BFAF;margin-top:2px;" data-i18n="${android ? "install_play_banner_sub" : "install_banner_sub"}">${android ? "Download the app from the Play Store" : "Two taps in Safari — no App Store needed"}</div>
      </div>
      <button type="button" id="pwaInstallBannerBtn" style="background:#F5C518;color:#111;border:none;border-radius:10px;padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;" data-i18n="${android ? "install_play_banner_btn" : "install_banner_btn"}">${android ? "Get on Play" : "Install"}</button>
      <button type="button" id="pwaInstallBannerDismiss" aria-label="Dismiss" style="background:none;border:none;color:#C9BFAF;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;">×</button>`;
    document.body.appendChild(banner);

    if (typeof applyTranslations === "function") applyTranslations(banner);
    document.getElementById("pwaInstallBannerBtn").addEventListener("click", promptPwaInstall);
    document.getElementById("pwaInstallBannerDismiss").addEventListener("click", () => {
      localStorage.setItem(DISMISS_KEY, "1");
      banner.remove();
    });

    window.addEventListener("langchange", () => {
      if (typeof applyTranslations === "function") applyTranslations(banner);
    });
  }

  function initPwaInstall(options) {
    const opts = options || {};
    const elementIds = [...(opts.buttonIds || []), ...(opts.rowIds || [])];

    if (opts.registerSw === true && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js").catch(console.error);
      });
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      window.dispatchEvent(new CustomEvent("pwa-install-ready"));
    });

    elementIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", promptPwaInstall);
    });

    if (isStandalone()) hideInstallElements(elementIds);
    window.addEventListener("appinstalled", () => {
      hideInstallElements(elementIds);
    });

    if (opts.showBanner) showInstallBanner();
  }

  window.initPwaInstall = initPwaInstall;
  window.showIosInstallGuide = showIosInstallGuide;
  window.promptPwaInstall = promptPwaInstall;
  window.isPwaStandalone = isStandalone;
})();
