(function () {
  const API_URL = "https://online-shops-production.up.railway.app";
  const SESSION_POLL_MS = 5000;
  let sessionPollTimer = null;
  let forcingLogout = false;

  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clearAuth() {
    localStorage.removeItem("zm_token");
    localStorage.removeItem("zm_user");
  }

  function forceLogoutSuspended(message) {
    if (forcingLogout) return;
    forcingLogout = true;
    stopSessionWatch();
    clearAuth();
    try {
      sessionStorage.setItem(
        "zm_logout_reason",
        message || "Your account has been suspended. Contact support."
      );
    } catch (e) {}
    if (!/login\.html/i.test(location.pathname)) {
      location.href = "/login.html?suspended=1";
    } else {
      forcingLogout = false;
    }
  }

  function isSuspendedResponse(res) {
    if (!res) return false;
    if (res.headers && res.headers.get("X-Account-Suspended") === "1") return true;
    return false;
  }

  function handleAuthResponse(res) {
    if (!res) return true;
    if (res.status === 401) {
      clearAuth();
      if (!/login\.html/i.test(location.pathname)) {
        location.href = "/login.html";
      }
      return false;
    }
    if (res.status === 403 && isSuspendedResponse(res)) {
      forceLogoutSuspended("Your account has been suspended. Contact support.");
      return false;
    }
    return true;
  }

  async function checkSessionOnce() {
    const token = localStorage.getItem("zm_token");
    if (!token) {
      stopSessionWatch();
      return;
    }
    try {
      const res = await fetch(`${API_URL}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        clearAuth();
        if (!/login\.html/i.test(location.pathname)) location.href = "/login.html";
        return;
      }
      if (res.status === 403) {
        let suspended = isSuspendedResponse(res);
        if (!suspended) {
          try {
            const data = await res.clone().json();
            suspended = !!(data && data.suspended);
          } catch (e) {}
        }
        if (suspended) {
          forceLogoutSuspended("Your account has been suspended. Contact support.");
        }
      }
    } catch (e) {
      /* offline — keep session until next check */
    }
  }

  function startSessionWatch() {
    if (sessionPollTimer || !localStorage.getItem("zm_token")) return;
    if (/login\.html|signup\.html|verify-otp\.html|forgot-password\.html/i.test(location.pathname)) {
      return;
    }
    checkSessionOnce();
    sessionPollTimer = setInterval(checkSessionOnce, SESSION_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkSessionOnce();
    });
  }

  function stopSessionWatch() {
    if (sessionPollTimer) {
      clearInterval(sessionPollTimer);
      sessionPollTimer = null;
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "force_logout") {
        forceLogoutSuspended(
          event.data.message || "Your account has been suspended. Contact support."
        );
      }
    });
  }

  window.escHtml = escHtml;
  window.clearAuth = clearAuth;
  window.handleAuthResponse = handleAuthResponse;
  window.forceLogoutSuspended = forceLogoutSuspended;
  window.startSessionWatch = startSessionWatch;
  window.stopSessionWatch = stopSessionWatch;
  window.ZM_API_URL = API_URL;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSessionWatch);
  } else {
    startSessionWatch();
  }
})();
