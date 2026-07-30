(function () {
  const LOW_DATA_KEY = "zm_low_data";
  const LAZY_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const PRESETS = {
    thumb: "w_240,c_limit,q_auto:low,f_auto",
    card: "w_360,c_limit,q_auto:low,f_auto",
    hero: "w_640,c_limit,q_auto:low,f_auto",
    chat: "w_280,c_limit,q_auto:low,f_auto",
    avatar: "w_64,c_limit,q_auto:low,f_auto",
    map: "w_200,c_limit,q_auto:low,f_auto",
    full: "w_960,c_limit,q_auto:low,f_auto",
  };

  let lazyObserver = null;

  function isLowData() {
    return localStorage.getItem(LOW_DATA_KEY) === "true";
  }

  function setLowData(enabled) {
    localStorage.setItem(LOW_DATA_KEY, enabled ? "true" : "false");
    document.body.classList.toggle("low-data", enabled);
    window.dispatchEvent(new Event("lowdatachange"));
  }

  function optimizeImageUrl(url, preset) {
    if (!url || !isLowData()) return url;
    if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
    const transform = PRESETS[preset] || PRESETS.card;
    const marker = `/upload/${transform}/`;
    if (url.includes(marker)) return url;
    return url.replace("/upload/", marker);
  }

  function escapeAttr(value) {
    return String(value).replace(/"/g, "&quot;");
  }

  function zmImg(url, opts) {
    const options = opts || {};
    const alt = options.alt || "";
    const className = options.className || "";
    const style = options.style || "";
    const preset = options.preset || "card";
    const defer = options.defer === true;
    const src = optimizeImageUrl(url, preset);
    const cls = className ? ` class="${escapeAttr(className)}"` : "";
    const styleAttr = style ? ` style="${escapeAttr(style)}"` : "";
    const altAttr = alt ? ` alt="${escapeAttr(alt)}"` : ' alt=""';

    if (defer && isLowData() && url) {
      return `<img${cls}${styleAttr}${altAttr} loading="lazy" decoding="async" data-zm-src="${escapeAttr(src)}" src="${LAZY_PLACEHOLDER}" />`;
    }
    return `<img${cls}${styleAttr}${altAttr} loading="lazy" decoding="async" src="${escapeAttr(src)}" />`;
  }

  function getPollInterval(normalMs) {
    return isLowData() ? Math.max(normalMs * 3, 10000) : normalMs;
  }

  function initLazyImageObserver() {
    if (lazyObserver || !("IntersectionObserver" in window)) return;
    lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const deferred = img.dataset.zmSrc;
        if (deferred) {
          img.src = deferred;
          delete img.dataset.zmSrc;
        }
        lazyObserver.unobserve(img);
      });
    }, { rootMargin: "200px" });
  }

  function observeLazyImages(root) {
    initLazyImageObserver();
    if (!lazyObserver) return;
    (root || document).querySelectorAll("img[data-zm-src]").forEach((img) => {
      if (img.dataset.zmSrc) lazyObserver.observe(img);
    });
  }

  function initDataSaver() {
    document.body.classList.toggle("low-data", isLowData());
    observeLazyImages();
  }

  function bootDataSaver() {
    initDataSaver();
    window.addEventListener("pageshow", initDataSaver);
  }

  window.isLowData = isLowData;
  window.setLowData = setLowData;
  window.optimizeImageUrl = optimizeImageUrl;
  window.zmImg = zmImg;
  window.observeLazyImages = observeLazyImages;
  window.getPollInterval = getPollInterval;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootDataSaver);
  } else {
    bootDataSaver();
  }
})();
