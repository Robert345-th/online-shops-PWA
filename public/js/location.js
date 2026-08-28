(function () {
  const GEO_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 60000,
  };

  let cancelPendingLocation = null;

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
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        if (cancelPendingLocation === rejectPending) {
          cancelPendingLocation = null;
        }
        fn(value);
      };
      const rejectPending = (err) => finish(reject, err || { code: 1, message: "cancelled" });
      cancelPendingLocation = rejectPending;

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          finish(resolve, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        (err) => finish(reject, err),
        { ...GEO_OPTIONS, ...(options || {}) }
      );
    });
  }

  function abortLocationRequest() {
    if (typeof cancelPendingLocation === "function") {
      const reject = cancelPendingLocation;
      cancelPendingLocation = null;
      reject({ code: 1, message: "cancelled" });
    }
  }

  window.addEventListener("zm-location-cancelled", abortLocationRequest);

  async function requestPlayStoreLocationPermission() {
    return new Promise((resolve) => {
      const bridge = window.ZedMarketLocation;
      if (!bridge || typeof bridge.requestAppLocationPermission !== "function") {
        resolve(true);
        return;
      }
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        window.__zmAppLocCb = null;
        resolve(!!ok);
      };
      window.__zmAppLocCb = finish;
      try {
        bridge.requestAppLocationPermission();
      } catch {
        finish(true);
        return;
      }
      setTimeout(() => finish(false), 60000);
    });
  }

  async function requestMapLocationCoords() {
    const bridge = window.ZedMarketLocation;
    try {
      if (bridge && typeof bridge.beginUserLocationRequest === "function") {
        bridge.beginUserLocationRequest();
      }
      return await getDeviceCoords({
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 180000,
      });
    } finally {
      if (bridge && typeof bridge.endUserLocationRequest === "function") {
        bridge.endUserLocationRequest();
      }
    }
  }

  async function requestUserLocationCoords() {
    return getDeviceCoords({
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 12000,
    });
  }

  async function requestDeviceCoords(forceFresh) {
    const freshOpts = forceFresh
      ? { maximumAge: 0, timeout: 12000, enableHighAccuracy: false }
      : {};
    return getDeviceCoords(freshOpts);
  }

  async function geocodeAreaLabel(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const search = /zambia/i.test(q) ? q : `${q}, Zambia`;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=zm&q=${encodeURIComponent(search)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data[0]) return null;
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
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

  function formatDistanceKm(km) {
    if (km == null || Number.isNaN(km)) return "";
    if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  }

  window.isValidCoords = isValidCoords;
  window.getDeviceCoords = getDeviceCoords;
  window.requestUserLocationCoords = requestUserLocationCoords;
  window.requestMapLocationCoords = requestMapLocationCoords;
  window.requestPlayStoreLocationPermission = requestPlayStoreLocationPermission;
  window.requestDeviceCoords = requestDeviceCoords;
  window.geocodeAreaLabel = geocodeAreaLabel;
  window.reverseGeocodeLabel = reverseGeocodeLabel;
  window.getLocationPermissionState = getLocationPermissionState;
  window.watchLocationPermission = watchLocationPermission;
  window.readSavedCoords = readSavedCoords;
  window.formatDistanceKm = formatDistanceKm;
  window.showLocHint = showLocHint;
  window.abortLocationRequest = abortLocationRequest;
})();
