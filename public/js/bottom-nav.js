(function () {
  function isInstalledApp() {
    return window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;
  }

  function hideDownloadNav() {
    if (!isInstalledApp()) return;
    document.querySelectorAll(".nav-download").forEach((el) => el.remove());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideDownloadNav);
  } else {
    hideDownloadNav();
  }

  window.addEventListener("appinstalled", hideDownloadNav);
})();
