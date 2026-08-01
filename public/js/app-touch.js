document.documentElement.style.background = "#111111";

(function () {
  const loadShield = document.createElement("div");
  loadShield.id = "zm-load-shield";
  loadShield.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "height:calc(var(--zm-safe-top, env(safe-area-inset-top, 0px)) + 6px)",
    "background:#111111",
    "z-index:2147483647",
    "pointer-events:none",
  ].join(";");
  (document.documentElement || document.head).appendChild(loadShield);

  function removeLoadShield() {
    loadShield.remove();
  }
  window.addEventListener("load", removeLoadShield, { once: true });
  setTimeout(removeLoadShield, 2500);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/viewport-fit=cover/i.test(viewport.content)) {
    const base = viewport.content.replace(/,?\s*viewport-fit=\w+/gi, "").replace(/,\s*$/, "");
    viewport.setAttribute("content", `${base}, viewport-fit=cover`);
  }

  const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusMeta) statusMeta.setAttribute("content", "black");

  function measureSafeTop() {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none;";
    document.documentElement.appendChild(probe);
    let inset = probe.getBoundingClientRect().height;
    probe.remove();

    if (inset <= 0 && window.visualViewport && window.visualViewport.offsetTop > 0) {
      inset = window.visualViewport.offsetTop;
    }

    document.documentElement.style.setProperty("--zm-safe-top", `${Math.max(0, inset)}px`);
    loadShield.style.height = `calc(${Math.max(0, inset)}px + 6px)`;
  }

  measureSafeTop();
  window.addEventListener("resize", measureSafeTop);
  window.addEventListener("pageshow", measureSafeTop);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", measureSafeTop);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", measureSafeTop);
  }

  const style = document.createElement("style");
  style.textContent = `
    html {
      background: #111111;
    }
    html::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--zm-safe-top, env(safe-area-inset-top, 0px));
      background: #111111;
      z-index: 10000;
      pointer-events: none;
    }
    .topbar,
    .sticky-header .topbar {
      padding-top: calc(16px + var(--zm-safe-top, env(safe-area-inset-top, 0px)));
      margin-top: calc(-1 * var(--zm-safe-top, env(safe-area-inset-top, 0px)));
    }
    html, body {
      -webkit-touch-callout: none;
    }
    body {
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }
    input, textarea, [contenteditable="true"] {
      user-select: text;
      -webkit-user-select: text;
    }
  `;
  document.head.appendChild(style);

  document.addEventListener("selectstart", (e) => {
    if (!e.target.closest("input, textarea, [contenteditable=\"true\"]")) {
      e.preventDefault();
    }
  });

  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("input, textarea, [contenteditable=\"true\"]")) {
      e.preventDefault();
    }
  });
})();
