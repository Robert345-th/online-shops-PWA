(function () {
  function listingShareUrl(item) {
    return `${window.location.origin}/listing.html?id=${item.id}`;
  }

  function listingShareText(item) {
    const lines = [
      item.title || "",
      item.price != null && item.price !== "" ? `K${item.price}` : "",
      item.location_label || "",
    ].filter(Boolean);
    const photo = item.photos && item.photos[0];
    if (photo) lines.push(photo);
    lines.push(listingShareUrl(item));
    return lines.join("\n");
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
