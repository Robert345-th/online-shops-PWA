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

  function tt(key, fallback) {
    if (typeof t === "function") {
      const value = t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function openWhatsAppText(text) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const opened = window.open(url, "_blank");
    if (!opened) window.location.href = url;
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
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(listingShareUrl(item))}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
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
        background: rgba(0,0,0,0.5); z-index: 320;
        align-items: flex-end; justify-content: center;
      }
      .zm-share-overlay.open { display: flex; }
      .zm-share-box {
        background: var(--bg, #F4F1EC); width: 100%; max-width: 480px;
        border-radius: 20px 20px 0 0;
        padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
      }
      .zm-share-handle {
        width: 40px; height: 4px; background: var(--border, #E2E0DC);
        border-radius: 2px; margin: 4px auto 14px;
      }
      .zm-share-title {
        font-size: 13px; font-weight: 800; text-transform: uppercase;
        letter-spacing: 0.04em; padding: 0 8px 10px; color: var(--text, #211D1A);
      }
      .zm-share-row {
        display: flex; align-items: center; gap: 12px;
        width: 100%; background: var(--card, #fff); border: 2px solid var(--border, #E2E0DC);
        padding: 14px 12px; margin-bottom: 8px; cursor: pointer;
        font-size: 14px; font-weight: 700; color: var(--text, #211D1A); text-align: left;
        -webkit-tap-highlight-color: transparent;
      }
      .zm-share-row svg { width: 22px; height: 22px; flex-shrink: 0; }
      .zm-share-cancel {
        width: 100%; margin-top: 4px; padding: 14px; background: var(--black, #111);
        color: var(--gold, #F5C518); border: none; font-weight: 800; font-size: 12px;
        text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "zmShareSheet";
    overlay.className = "zm-share-overlay";
    overlay.innerHTML = `
      <div class="zm-share-box" role="dialog" aria-modal="true">
        <div class="zm-share-handle"></div>
        <div class="zm-share-title" data-zm-share-title>Share</div>
        <button class="zm-share-row" type="button" data-share="whatsapp">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span>Share on WhatsApp</span>
        </button>
        <button class="zm-share-row" type="button" data-share="facebook">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
          <span>Share on Facebook</span>
        </button>
        <button class="zm-share-cancel" type="button" data-zm-share-cancel>Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeShareSheet();
    });
    overlay.querySelector("[data-zm-share-cancel]").addEventListener("click", closeShareSheet);
    overlay.querySelector("[data-share=whatsapp]").addEventListener("click", () => {
      const item = pendingShareItem;
      closeShareSheet();
      if (item) shareListingToWhatsApp(item);
    });
    overlay.querySelector("[data-share=facebook]").addEventListener("click", () => {
      const item = pendingShareItem;
      closeShareSheet();
      if (item) shareListingToFacebook(item);
    });
  }

  function openListingShareSheet(item) {
    if (!item || !item.id) return;
    pendingShareItem = item;
    ensureShareSheet();
    const overlay = document.getElementById("zmShareSheet");
    overlay.querySelector("[data-zm-share-title]").textContent = tt("share", "Share");
    overlay.querySelector("[data-share=whatsapp] span").textContent = tt("share_whatsapp", "Share on WhatsApp");
    overlay.querySelector("[data-share=facebook] span").textContent = tt("share_facebook", "Share on Facebook");
    overlay.querySelector("[data-zm-share-cancel]").textContent = tt("cancel", "Cancel");
    overlay.classList.add("open");
  }

  window.listingShareText = listingShareText;
  window.shareListingToWhatsApp = shareListingToWhatsApp;
  window.shareListingToFacebook = shareListingToFacebook;
  window.openListingShareSheet = openListingShareSheet;
})();
