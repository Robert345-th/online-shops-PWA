(function () {
  function listingShareUrl(item) {
    return `https://zedmarket.app/listing.html?id=${item.id}`;
  }

  function formatPrice(price) {
    const amount = Number(price);
    if (!Number.isFinite(amount)) return "";
    return "K" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function listingShareText(item) {
    const details = [
      item.title || "",
      formatPrice(item.price),
      item.location_label || "",
      [item.category, item.condition].filter(Boolean).join(" · "),
    ].filter(Boolean);
    details.push("");
    details.push("View on ZedMarket — register or log in to see this listing:");
    details.push(listingShareUrl(item));
    return details.join("\n");
  }

  function listingPhoto(item) {
    const raw = item.photos && item.photos[0];
    if (!raw) {
      return item.video_url && window.videoPosterUrl ? videoPosterUrl(item.video_url) : "";
    }
    return typeof optimizeImageUrl === "function" ? optimizeImageUrl(raw, "hero") : raw;
  }

  function tt(key, fallback) {
    if (typeof t === "function") {
      const value = t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function openExternal(url) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
  }

  function openWhatsAppText(text) {
    openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }

  async function shareListingToWhatsApp(item) {
    if (!item || !item.id) return;
    const text = listingShareText(item);
    const photo = item.photos && item.photos[0];

    try {
      if (photo && navigator.share && navigator.canShare) {
        const res = await fetch(photo, { mode: "cors" });
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], "zedmarket.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: item.title || "ZedMarket",
              text,
            });
            return;
          }
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }

    openWhatsAppText(text);
  }

  function shareListingToFacebook(item) {
    if (!item || !item.id) return;
    openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(listingShareUrl(item))}`);
  }

  function shareListingToTelegram(item) {
    if (!item || !item.id) return;
    const url = listingShareUrl(item);
    const text = [item.title || "ZedMarket", formatPrice(item.price)].filter(Boolean).join(" — ");
    openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  }

  function shareListingToSms(item) {
    if (!item || !item.id) return;
    window.location.href = `sms:?body=${encodeURIComponent(listingShareText(item))}`;
  }

  async function copyListingLink(item) {
    if (!item || !item.id) return;
    const url = listingShareUrl(item);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      showToast(tt("share_copied", "Link copied"));
    } catch (e) {
      showToast(url);
    }
  }

  async function shareListingNative(item) {
    if (!item || !item.id) return;
    const url = listingShareUrl(item);
    const text = listingShareText(item);
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title || "ZedMarket", text, url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    await copyListingLink(item);
  }

  async function shareListingStoryImage(item) {
    if (!item || !item.id) return;
    const url = listingShareUrl(item);
    const text = `${item.title || "ZedMarket"} — ${formatPrice(item.price)}\n${url}`;
    const imgUrl = listingPhoto(item);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, 1080, 1920);
      if (imgUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imgUrl;
        });
        const scale = Math.max(1080 / img.width, 1200 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (1080 - w) / 2, (1200 - h) / 2, w, h);
      }
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 1180, 1080, 740);
      ctx.fillStyle = "#F5C518";
      ctx.font = "bold 72px sans-serif";
      ctx.fillText(formatPrice(item.price) || "ZedMarket", 64, 1320);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 48px sans-serif";
      ctx.fillText(String(item.title || "").slice(0, 42), 64, 1410);
      ctx.fillStyle = "#F5C518";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("ZedMarket", 64, 1820);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      const file = blob ? new File([blob], "zedmarket-status.jpg", { type: "image/jpeg" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    await shareListingNative(item);
  }

  function showToast(message) {
    let toast = document.getElementById("zmShareToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "zmShareToast";
      toast.className = "zm-share-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  let pendingShareItem = null;

  function closeShareSheet() {
    const el = document.getElementById("zmShareSheet");
    if (el) el.classList.remove("open");
    pendingShareItem = null;
  }

  function ensureShareSheet() {
    if (document.getElementById("zmShareSheet")) return;

    const style = document.createElement("style");
    style.textContent = `
      .zm-share-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.45); z-index: 320;
        align-items: flex-end; justify-content: center;
      }
      .zm-share-overlay.open { display: flex; }
      .zm-share-box {
        background: var(--card, #fff); width: 100%; max-width: 480px;
        border-radius: 18px 18px 0 0;
        padding: 8px 0 calc(12px + env(safe-area-inset-bottom, 0px));
        color: var(--text, #211D1A);
      }
      .zm-share-handle {
        width: 36px; height: 4px; background: var(--border, #E2E0DC);
        border-radius: 2px; margin: 6px auto 4px;
      }
      .zm-share-head {
        position: relative; display: flex; align-items: center; justify-content: center;
        min-height: 40px; padding: 4px 48px 10px;
      }
      .zm-share-title {
        font-size: 16px; font-weight: 700; color: var(--text, #211D1A);
      }
      .zm-share-close {
        position: absolute; right: 12px; top: 4px;
        width: 32px; height: 32px; border: none; border-radius: 16px;
        background: #F1F1F1; color: #111; font-size: 18px; line-height: 1;
        cursor: pointer;
      }
      body.dark .zm-share-close { background: #333; color: #fff; }
      .zm-share-strip {
        display: flex; gap: 14px; overflow-x: auto;
        padding: 6px 16px 14px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .zm-share-strip::-webkit-scrollbar { display: none; }
      .zm-share-item {
        flex: 0 0 64px; width: 64px; border: none; background: none;
        display: flex; flex-direction: column; align-items: center; gap: 7px;
        padding: 0; cursor: pointer; color: var(--text, #211D1A);
        font-size: 11px; font-weight: 600; line-height: 1.15; text-align: center;
        -webkit-tap-highlight-color: transparent;
      }
      .zm-share-ico {
        width: 56px; height: 56px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .zm-share-ico svg { width: 28px; height: 28px; display: block; }
      .zm-share-ico.wa { background: #25D366; }
      .zm-share-ico.status { background: #25D366; }
      .zm-share-ico.fb { background: #1877F2; }
      .zm-share-ico.ig {
        background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%);
      }
      .zm-share-ico.stories {
        background: #fff; border: 2px solid transparent;
        background-image: linear-gradient(#fff, #fff), radial-gradient(circle at 30% 107%, #fdf497, #fd5949 45%, #d6249f 70%, #285AEB);
        background-origin: border-box; background-clip: content-box, border-box;
      }
      body.dark .zm-share-ico.stories {
        background-image: linear-gradient(#1E1E1E, #1E1E1E), radial-gradient(circle at 30% 107%, #fdf497, #fd5949 45%, #d6249f 70%, #285AEB);
      }
      .zm-share-ico.tg { background: #229ED9; }
      .zm-share-ico.sms { background: #34C759; }
      .zm-share-ico.muted { background: #F1F1F1; }
      body.dark .zm-share-ico.muted { background: #333; }
      .zm-share-ico.muted svg { stroke: var(--text, #211D1A); fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .zm-share-ico.muted svg.filled { fill: var(--text, #211D1A); stroke: none; }
      .zm-share-line { height: 1px; background: var(--border, #EFEFEF); margin: 2px 0 6px; }
      .zm-share-toast {
        position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(12px);
        background: #111; color: #F5C518; padding: 10px 16px; border-radius: 999px;
        font-size: 13px; font-weight: 700; z-index: 400; opacity: 0; pointer-events: none;
        transition: opacity 0.2s, transform 0.2s; white-space: nowrap;
      }
      .zm-share-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "zmShareSheet";
    overlay.className = "zm-share-overlay";
    overlay.innerHTML = `
      <div class="zm-share-box" role="dialog" aria-modal="true">
        <div class="zm-share-handle"></div>
        <div class="zm-share-head">
          <div class="zm-share-title" data-zm-share-title>Share</div>
          <button class="zm-share-close" type="button" data-zm-share-cancel aria-label="Close">×</button>
        </div>
        <div class="zm-share-strip">
          <button class="zm-share-item" type="button" data-share="whatsapp">
            <span class="zm-share-ico wa"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span>
            <span data-share-label="whatsapp">WhatsApp</span>
          </button>
          <button class="zm-share-item" type="button" data-share="status">
            <span class="zm-share-ico status"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.2" stroke-dasharray="3.2 2.6"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg></span>
            <span data-share-label="status">Status</span>
          </button>
          <button class="zm-share-item" type="button" data-share="facebook">
            <span class="zm-share-ico fb"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M14.5 8.5V6.8c0-.7.5-1.3 1.6-1.3h1.4V3h-2.4C12.4 3 11 4.5 11 6.7v1.8H8.5V11H11v10h3.5V11H17l.5-2.5h-3z"/></svg></span>
            <span data-share-label="facebook">Facebook</span>
          </button>
          <button class="zm-share-item" type="button" data-share="instagram">
            <span class="zm-share-ico ig"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/></svg></span>
            <span data-share-label="instagram">Instagram</span>
          </button>
          <button class="zm-share-item" type="button" data-share="stories">
            <span class="zm-share-ico stories"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="#d6249f" stroke-width="2"/><path d="M12 9.5v5M9.5 12h5" stroke="#d6249f" stroke-width="2" stroke-linecap="round"/></svg></span>
            <span data-share-label="stories">Stories</span>
          </button>
        </div>
        <div class="zm-share-line"></div>
        <div class="zm-share-strip">
          <button class="zm-share-item" type="button" data-share="telegram">
            <span class="zm-share-ico tg"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M9.6 15.4l-.4 4.1c.6 0 .8-.2 1.1-.5l2.6-2.5 5.4 4c1 .5 1.7.2 2-.9l3.6-16.8c.3-1.4-.5-2-1.5-1.6L1.7 9.3c-1.4.5-1.3 1.3-.2 1.6l4.9 1.5L19.2 5.6c.6-.4 1.1-.2.7.2"/></svg></span>
            <span data-share-label="telegram">Telegram</span>
          </button>
          <button class="zm-share-item" type="button" data-share="sms">
            <span class="zm-share-ico sms"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2z"/></svg></span>
            <span data-share-label="sms">SMS</span>
          </button>
          <button class="zm-share-item" type="button" data-share="copy">
            <span class="zm-share-ico muted"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span>
            <span data-share-label="copy">Copy</span>
          </button>
          <button class="zm-share-item" type="button" data-share="more">
            <span class="zm-share-ico muted"><svg class="filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></span>
            <span data-share-label="more">More</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeShareSheet();
    });
    overlay.querySelector("[data-zm-share-cancel]").addEventListener("click", closeShareSheet);
    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-share]");
      if (!btn) return;
      const item = pendingShareItem;
      const action = btn.getAttribute("data-share");
      closeShareSheet();
      if (!item) return;
      if (action === "whatsapp") shareListingToWhatsApp(item);
      else if (action === "facebook") shareListingToFacebook(item);
      else if (action === "telegram") shareListingToTelegram(item);
      else if (action === "sms") shareListingToSms(item);
      else if (action === "copy") copyListingLink(item);
      else if (action === "more" || action === "instagram") shareListingNative(item);
      else if (action === "status" || action === "stories") shareListingStoryImage(item);
    });
  }

  function openListingShareSheet(item) {
    if (!item || !item.id) return;
    pendingShareItem = item;
    ensureShareSheet();
    const overlay = document.getElementById("zmShareSheet");
    overlay.querySelector("[data-zm-share-title]").textContent = tt("share", "Share");
    overlay.querySelector("[data-share-label=whatsapp]").textContent = tt("share_wa_short", "WhatsApp");
    overlay.querySelector("[data-share-label=status]").textContent = tt("share_status_short", "Status");
    overlay.querySelector("[data-share-label=facebook]").textContent = tt("share_fb_short", "Facebook");
    overlay.querySelector("[data-share-label=instagram]").textContent = tt("share_instagram", "Instagram");
    overlay.querySelector("[data-share-label=stories]").textContent = tt("share_stories", "Stories");
    overlay.querySelector("[data-share-label=telegram]").textContent = tt("share_telegram", "Telegram");
    overlay.querySelector("[data-share-label=sms]").textContent = tt("share_sms", "SMS");
    overlay.querySelector("[data-share-label=copy]").textContent = tt("share_copy", "Copy");
    overlay.querySelector("[data-share-label=more]").textContent = tt("share_more", "More");
    overlay.querySelector("[data-zm-share-cancel]").setAttribute("aria-label", tt("cancel", "Cancel"));
    overlay.classList.add("open");
  }

  window.listingShareText = listingShareText;
  window.shareListingToWhatsApp = shareListingToWhatsApp;
  window.shareListingToFacebook = shareListingToFacebook;
  window.openListingShareSheet = openListingShareSheet;
})();
