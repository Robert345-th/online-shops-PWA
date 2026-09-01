(function () {
  function hasLang() {
    return !!localStorage.getItem("zm_lang");
  }
  if (hasLang()) return;

  const LANGS = [
    { code: "en", name: "English", sample: "Welcome to ZedMarket" },
    { code: "bem", name: "IciBemba", sample: "Twaiseni ku ZedMarket" },
    { code: "ny", name: "Chinyanja", sample: "Takulandirani ku ZedMarket" },
  ];

  const overlay = document.createElement("div");
  overlay.id = "zmLangGate";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <style>
      #zmLangGate {
        position: fixed; inset: 0; z-index: 4000;
        background: #111111; color: #F0EDE8;
        display: flex; flex-direction: column; justify-content: center;
        padding: 32px 24px calc(32px + env(safe-area-inset-bottom));
        font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      }
      #zmLangGate .gate-brand {
        font-size: 12px; font-weight: 800; letter-spacing: 0.16em;
        text-transform: uppercase; color: #F5C518; margin-bottom: 14px;
      }
      #zmLangGate .gate-title { font-size: 28px; font-weight: 900; line-height: 1.15; margin-bottom: 6px; }
      #zmLangGate .gate-sub { font-size: 13px; color: #A8A29B; margin-bottom: 8px; }
      #zmLangGate .gate-sub + .gate-sub { margin-bottom: 22px; }
      #zmLangGate .gate-btn {
        width: 100%; text-align: left; background: #1E1E1E; color: #F0EDE8;
        border: 2px solid #333; padding: 16px; margin-bottom: 10px; cursor: pointer;
      }
      #zmLangGate .gate-btn:active { border-color: #F5C518; }
      #zmLangGate .gate-name { font-size: 16px; font-weight: 800; }
      #zmLangGate .gate-sample { font-size: 12px; color: #A8A29B; margin-top: 4px; }
    </style>
    <div class="gate-brand">ZedMarket</div>
    <div class="gate-title">Choose your language</div>
    <div class="gate-sub">Saleni ululimi lwenu</div>
    <div class="gate-sub">Sankhani chilankhulo chanu</div>
    ${LANGS.map((lang) => `
      <button type="button" class="gate-btn" data-lang="${lang.code}">
        <div class="gate-name">${lang.name}</div>
        <div class="gate-sample">${lang.sample}</div>
      </button>
    `).join("")}
  `;

  function mount() {
    if (hasLang() || document.getElementById("zmLangGate")) return;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof setLangAndApply === "function") setLangAndApply(btn.dataset.lang);
        else localStorage.setItem("zm_lang", btn.dataset.lang);
        overlay.remove();
      });
    });
  }

  function start() {
    if (hasLang()) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }
  }

  if (localStorage.getItem("zm_token") && window.zmPrefsReady) {
    Promise.resolve(window.zmPrefsReady).then(start).catch(start);
  } else {
    start();
  }
})();
