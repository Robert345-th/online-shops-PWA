(function () {
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

  function handleAuthResponse(res) {
    if (res.status === 401) {
      clearAuth();
      if (!window.location.pathname.includes("login.html")) {
        window.location.href = "/login.html";
      }
      return false;
    }
    return true;
  }

  window.escHtml = escHtml;
  window.clearAuth = clearAuth;
  window.handleAuthResponse = handleAuthResponse;
})();
