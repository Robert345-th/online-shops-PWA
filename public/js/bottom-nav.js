(function () {
  const API_URL = "https://online-shops-production.up.railway.app";

  const NAV_STYLE = `
    .bottom-nav {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--card, #fff); border-top: 1px solid var(--border, #E2E0DC);
      display: flex; padding: 6px 0 max(6px, env(safe-area-inset-bottom));
      z-index: 50;
    }
    body.zm-has-bottom-nav { padding-bottom: 62px; }
    .bottom-nav .nav-item {
      flex: 1; text-align: center; text-decoration: none; color: var(--subtext, #5C5955);
      font-size: 10px; padding: 4px 2px; min-width: 0;
      background: none; border: none; cursor: pointer; font-family: inherit;
    }
    .bottom-nav .nav-item.active { color: var(--orange, #FF7A1A); font-weight: 700; }
    .bottom-nav .nav-icon-wrap { position: relative; display: inline-flex; margin-bottom: 2px; }
    .bottom-nav .nav-icon { display: flex; align-items: center; justify-content: center; }
    .bottom-nav .nav-icon svg {
      width: 21px; height: 21px; stroke: currentColor; fill: none;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }
    .bottom-nav .nav-label { line-height: 1.2; }
    .bottom-nav .nav-badge {
      position: absolute; top: -4px; right: -10px;
      background: #E01B27; color: #fff; font-size: 9px; font-weight: 700;
      min-width: 16px; height: 16px; border-radius: 8px;
      display: none; align-items: center; justify-content: center; padding: 0 3px;
    }
  `;

  const ICONS = {
    home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/>',
    wanted: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>',
    confirm: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    shop: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    install: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  };

  const ITEMS = [
    { key: "home", href: "/index.html", label: "home" },
    { key: "wanted", href: "/wanted.html", label: "nav_wanted" },
    { key: "confirm", href: "/sale-confirmations.html", label: "nav_confirm", badge: true },
    { key: "shop", href: "/my-shop.html", label: "my_shop" },
  ];

  function injectStyles() {
    if (document.getElementById("bottom-nav-styles")) return;
    const style = document.createElement("style");
    style.id = "bottom-nav-styles";
    style.textContent = NAV_STYLE;
    document.head.appendChild(style);
  }

  function shouldShowInstallNav() {
    if (typeof window.isPwaStandalone === "function" && window.isPwaStandalone()) return false;
    if (typeof window.isPlayStoreApp === "function" && window.isPlayStoreApp()) return false;
    return true;
  }

  function getInstallNavLabel() {
    if (typeof window.isAndroidChrome === "function" && window.isAndroidChrome()) return "nav_install";
    if (/Android/i.test(navigator.userAgent)) return "nav_download";
    return "nav_install";
  }

  function renderInstallNavItem() {
    if (!shouldShowInstallNav()) return "";
    const labelKey = getInstallNavLabel();
    const label = typeof t === "function" ? t(labelKey) : labelKey;
    return `
      <button type="button" class="nav-item" id="navInstallBtn">
        <div class="nav-icon-wrap">
          <div class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.install}</svg></div>
        </div>
        <div class="nav-label" data-i18n="${labelKey}">${label}</div>
      </button>`;
  }

  function wireInstallNavButton() {
    const btn = document.getElementById("navInstallBtn");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (typeof window.isAndroidChrome === "function" && window.isAndroidChrome() && typeof window.promptPwaInstall === "function") {
        window.promptPwaInstall();
        return;
      }
      if (/Android/i.test(navigator.userAgent)) {
        window.location.href = "/download.html";
        return;
      }
      if (typeof window.promptPwaInstall === "function") window.promptPwaInstall();
    });
  }

  function wireNavAuth() {
    const mount = document.getElementById("bottomNav");
    if (!mount || mount.dataset.authWired === "1") return;
    mount.dataset.authWired = "1";
    mount.querySelectorAll(".nav-item[href]").forEach((el) => {
      const href = el.getAttribute("href") || "";
      if (href === "/index.html" || href === "/") return;
      el.addEventListener("click", (e) => {
        if (typeof zmRequireLogin === "function") {
          if (!zmRequireLogin(href)) e.preventDefault();
          return;
        }
        if (!localStorage.getItem("zm_token")) {
          e.preventDefault();
          location.href = `/login.html?next=${encodeURIComponent(href)}`;
        }
      });
    });
  }

  function renderBottomNav(active) {
    injectStyles();
    let mount = document.getElementById("bottomNav");
    if (!mount) {
      mount = document.createElement("nav");
      mount.id = "bottomNav";
      mount.setAttribute("aria-label", "Main");
      document.body.appendChild(mount);
    }
    document.body.classList.add("zm-has-bottom-nav");
    mount.className = "bottom-nav";
    mount.innerHTML = ITEMS.map((item) => {
      const isActive = active && item.key === active;
      const badge = item.badge ? '<span class="nav-badge" id="navConfirmBadge"></span>' : "";
      const label = typeof t === "function" ? t(item.label) : item.label;
      return `
        <a href="${item.href}" class="nav-item${isActive ? " active" : ""}">
          <div class="nav-icon-wrap">
            <div class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[item.key]}</svg></div>
            ${badge}
          </div>
          <div class="nav-label" data-i18n="${item.label}">${label}</div>
        </a>`;
    }).join("") + renderInstallNavItem();
    if (typeof applyTranslations === "function") applyTranslations(mount);
    wireInstallNavButton();
    wireNavAuth();
    refreshNavConfirmBadge();
  }

  async function refreshNavConfirmBadge() {
    const badge = document.getElementById("navConfirmBadge");
    if (!badge) return;
    const token = localStorage.getItem("zm_token");
    if (!token) {
      badge.style.display = "none";
      return;
    }
    try {
      const res = await fetch(`${API_URL}/sale-confirmations/pending-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const count = parseInt(data.count, 10) || 0;
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    } catch (e) {}
  }

  window.renderBottomNav = renderBottomNav;
  window.refreshNavConfirmBadge = refreshNavConfirmBadge;

  function boot() {
    if (!document.body.hasAttribute("data-nav-active")) return;
    renderBottomNav(document.body.dataset.navActive || null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("pageshow", () => {
    if (document.body.hasAttribute("data-nav-active")) refreshNavConfirmBadge();
  });

  window.addEventListener("langchange", () => {
    if (document.body.hasAttribute("data-nav-active")) {
      renderBottomNav(document.body.dataset.navActive || null);
    }
  });

  window.addEventListener("pwa-install-ready", () => {
    if (document.body.hasAttribute("data-nav-active")) {
      renderBottomNav(document.body.dataset.navActive || null);
    }
  });

  window.addEventListener("appinstalled", () => {
    if (document.body.hasAttribute("data-nav-active")) {
      renderBottomNav(document.body.dataset.navActive || null);
    }
  });
})();
