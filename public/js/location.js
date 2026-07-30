(function () {
  const GEO_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 20000,
    maximumAge: 120000,
  };

  function locationErrorMessage(err) {
    if (!err || err.code === "UNSUPPORTED") {
      return "Location is not supported on this device. Type your area instead.";
    }
    switch (err.code) {
      case 1:
        return "Location is blocked. Allow it in phone Settings → Apps → ZedMarket → Permissions, or type your area below.";
      case 2:
        return "GPS signal not found. Turn on Location and try again, or type your area below.";
      case 3:
        return "Location took too long. Try again or type your area below.";
      default:
        return "Could not get your location. Type your area below instead.";
    }
  }

  function getDeviceCoords(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: "UNSUPPORTED" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { ...GEO_OPTIONS, ...(options || {}) }
      );
    });
  }

  async function reverseGeocodeLabel(lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      if (!res.ok) throw new Error("geocode failed");
      const data = await res.json();
      const addr = data.address || {};
      const label = [addr.suburb || addr.city_district || addr.town || addr.city, addr.state]
        .filter(Boolean)
        .join(", ");
      return label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  function showLocHint(el, message, isError) {
    if (!el) return;
    if (!message) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.style.display = "block";
    el.classList.toggle("loc-hint-error", !!isError);
    el.classList.toggle("loc-hint-ok", !isError);
  }

  window.getDeviceCoords = getDeviceCoords;
  window.reverseGeocodeLabel = reverseGeocodeLabel;
  window.locationErrorMessage = locationErrorMessage;
  window.showLocHint = showLocHint;
})();
