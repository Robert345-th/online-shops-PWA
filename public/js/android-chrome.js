(function () {
  const REDIRECT_KEY = "zm_chrome_redirect";

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

  function buildChromeIntentUrl() {
    return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  function openInChrome() {
    window.location.replace(buildChromeIntentUrl());
  }

  function maybeRedirectToChrome() {
    if (!isAndroid() || isStandalone() || isAndroidChrome()) return;
    const stamp = `${location.pathname}${location.search}`;
    if (sessionStorage.getItem(REDIRECT_KEY) === stamp) return;
    sessionStorage.setItem(REDIRECT_KEY, stamp);
    openInChrome();
  }

  window.openInChrome = openInChrome;
  window.isAndroidChrome = isAndroidChrome;
  maybeRedirectToChrome();
})();
