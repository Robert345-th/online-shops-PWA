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
      const isActive = item.key === active;
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
    }).join("");
    if (typeof applyTranslations === "function") applyTranslations(mount);
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
    const active = document.body.dataset.navActive;
    if (active) renderBottomNav(active);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("pageshow", () => {
    if (document.body.dataset.navActive) refreshNavConfirmBadge();
  });

  window.addEventListener("langchange", () => {
    const active = document.body.dataset.navActive;
    if (active) renderBottomNav(active);
  });
})();
