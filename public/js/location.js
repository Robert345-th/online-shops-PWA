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
    const local = lookupZambiaArea(q);
    if (local) return local;
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

  function lookupZambiaArea(query) {
    const n = query.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    const areas = {
      lusaka: { lat: -15.3875, lng: 28.3228 },
      kabulonga: { lat: -15.424, lng: 28.348 },
      woodlands: { lat: -15.41, lng: 28.325 },
      olympia: { lat: -15.392, lng: 28.31 },
      "roma": { lat: -15.385, lng: 28.355 },
      chilanga: { lat: -15.55, lng: 28.27 },
      chilenje: { lat: -15.445, lng: 28.33 },
      matero: { lat: -15.38, lng: 28.27 },
      "chelstone": { lat: -15.365, lng: 28.4 },
      avondale: { lat: -15.4, lng: 28.29 },
      ndola: { lat: -12.968, lng: 28.633 },
      kitwe: { lat: -12.802, lng: 28.213 },
      chingola: { lat: -12.529, lng: 27.884 },
      mufulira: { lat: -12.55, lng: 28.24 },
      luanshya: { lat: -13.137, lng: 28.417 },
      kalulushi: { lat: -12.838, lng: 28.095 },
      livingstone: { lat: -17.842, lng: 25.854 },
      kabwe: { lat: -14.447, lng: 28.446 },
      kapiri: { lat: -13.971, lng: 28.67 },
      mkushi: { lat: -13.62, lng: 29.39 },
      serenje: { lat: -13.23, lng: 30.24 },
      chipata: { lat: -13.633, lng: 32.646 },
      petauke: { lat: -14.25, lng: 31.33 },
      katete: { lat: -14.06, lng: 32.04 },
      lundazi: { lat: -12.29, lng: 33.17 },
      kasama: { lat: -10.213, lng: 31.181 },
      mbala: { lat: -8.84, lng: 31.37 },
      mpika: { lat: -11.87, lng: 31.43 },
      mansa: { lat: -11.2, lng: 28.89 },
      kawambwa: { lat: -9.8, lng: 29.08 },
      mongu: { lat: -15.248, lng: 23.127 },
      senanga: { lat: -16.12, lng: 23.27 },
      kaoma: { lat: -14.8, lng: 24.8 },
      solwezi: { lat: -12.174, lng: 26.389 },
      mwinilunga: { lat: -11.74, lng: 24.43 },
      kasempa: { lat: -13.46, lng: 25.83 },
      choma: { lat: -16.809, lng: 26.988 },
      mazabuka: { lat: -15.856, lng: 27.748 },
      monze: { lat: -16.28, lng: 27.48 },
      kalomo: { lat: -17.03, lng: 26.49 },
      namwala: { lat: -15.75, lng: 26.44 },
      "siavonga": { lat: -16.54, lng: 28.72 },
      chirundu: { lat: -16.03, lng: 28.85 },
      kafue: { lat: -15.77, lng: 28.18 },
      chongwe: { lat: -15.33, lng: 28.68 },
    };
    const keys = Object.keys(areas).sort((a, b) => b.length - a.length);
    const tokens = n.split(" ");
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (n === key || tokens.includes(key)) return areas[key];
      if (key.length >= 4 && n.includes(key)) return areas[key];
    }
    return null;
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
