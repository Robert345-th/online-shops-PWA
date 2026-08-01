(function () {
  async function compressImage(file, maxDim, quality) {
    if (!file || !file.type.startsWith("image/")) return file;
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) return file;
      return new File([blob], "photo.jpg", { type: "image/jpeg" });
    } catch {
      return file;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  window.compressImage = compressImage;
})();
