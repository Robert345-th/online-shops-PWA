(function () {
  const GEO_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 20000,
    maximumAge: 60000,
  };

  function isValidCoords(coords) {
    return (
      coords &&
      typeof coords.lat === "number" &&
      typeof coords.lng === "number" &&
      !Number.isNaN(coords.lat) &&
      !Number.isNaN(coords.lng)
    );
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

  async function requestUserLocationCoords() {
    try {
      return await getDeviceCoords({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 60000,
      });
    } catch (err) {
      const permState = await getLocationPermissionState();
      if (permState === "denied") throw err;
      return await getDeviceCoords({
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 30000,
      });
    }
  }

  async function requestDeviceCoords(forceFresh) {
    const freshOpts = forceFresh
      ? { maximumAge: 0, timeout: 30000, enableHighAccuracy: true }
      : {};

    try {
      return await getDeviceCoords(freshOpts);
    } catch (err) {
      if (err && (err.code === 2 || err.code === 3)) {
        return await getDeviceCoords({
          maximumAge: 0,
          timeout: 30000,
          enableHighAccuracy: false,
        });
      }
      throw err;
    }
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

  async function getLocationPermissionState() {
    if (!navigator.geolocation) return "unsupported";
    if (!navigator.permissions) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      return result.state;
    } catch {
      return "unknown";
    }
  }

  function watchLocationPermission(onChange) {
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        status.onchange = () => onChange(status.state);
      })
      .catch(() => {});
  }

  function readSavedCoords(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isValidCoords(parsed) ? parsed : null;
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  window.isValidCoords = isValidCoords;
  window.getDeviceCoords = getDeviceCoords;
  window.requestUserLocationCoords = requestUserLocationCoords;
  window.requestDeviceCoords = requestDeviceCoords;
  window.reverseGeocodeLabel = reverseGeocodeLabel;
  window.getLocationPermissionState = getLocationPermissionState;
  window.watchLocationPermission = watchLocationPermission;
  window.readSavedCoords = readSavedCoords;
  window.showLocHint = showLocHint;
})();
