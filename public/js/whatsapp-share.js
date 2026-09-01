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

  window.listingShareText = listingShareText;
  window.shareListingToWhatsApp = shareListingToWhatsApp;
})();
