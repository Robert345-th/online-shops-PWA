(function () {
  const SHOW_ONLINE_KEY = "zm_show_online";
  const SHOW_LAST_SEEN_KEY = "zm_show_last_seen";
  const HEARTBEAT_MS = 30000;

  let heartbeatTimer = null;

  function getToken() {
    return localStorage.getItem("zm_token");
  }

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  function getShowOnline() {
    return localStorage.getItem(SHOW_ONLINE_KEY) !== "false";
  }

  function getShowLastSeen() {
    return localStorage.getItem(SHOW_LAST_SEEN_KEY) !== "false";
  }

  function setShowOnline(value) {
    localStorage.setItem(SHOW_ONLINE_KEY, value ? "true" : "false");
  }

  function setShowLastSeen(value) {
    localStorage.setItem(SHOW_LAST_SEEN_KEY, value ? "true" : "false");
  }

  async function sendHeartbeat() {
    const token = getToken();
    if (!token) return;
    try {
      await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          show_online: getShowOnline(),
          show_last_seen: getShowLastSeen(),
        }),
      });
    } catch (e) {}
  }

  function startPresenceHeartbeat() {
    if (heartbeatTimer || !getToken()) return;
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sendHeartbeat();
    });
  }

  function stopPresenceHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function fetchPresenceMap(userIds, options) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return {};
    const opts = options || {};
    const params = new URLSearchParams({ ids: ids.join(",") });
    if (opts.includeTyping) params.set("include_typing", "1");
    try {
      const res = await fetch(`/api/presence/batch?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) return {};
      return await res.json();
    } catch (e) {
      return {};
    }
  }

  let typingPingTimer = null;
  let typingStopTimer = null;
  let typingTargetId = null;

  async function sendTypingState(targetUserId, typing) {
    if (!getToken() || !targetUserId) return;
    try {
      await fetch("/api/presence/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ target_user_id: targetUserId, typing }),
      });
    } catch (e) {}
  }

  function notifyTyping(targetUserId) {
    if (!targetUserId) return;
    typingTargetId = targetUserId;
    sendTypingState(targetUserId, true);
    clearTimeout(typingStopTimer);
    clearInterval(typingPingTimer);
    typingPingTimer = setInterval(() => sendTypingState(targetUserId, true), 2000);
    typingStopTimer = setTimeout(() => stopTyping(targetUserId), 4000);
  }

  function stopTyping(targetUserId) {
    const id = targetUserId || typingTargetId;
    if (!id) return;
    clearTimeout(typingStopTimer);
    clearInterval(typingPingTimer);
    typingPingTimer = null;
    typingStopTimer = null;
    sendTypingState(id, false);
    if (typingTargetId === id) typingTargetId = null;
  }

  function formatLastSeenTime(iso) {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return typeof t === "function" ? t("last_seen_just_now") : "just now";
    if (mins < 60) {
      return typeof t === "function" ? t("last_seen_mins", { n: mins }) : `${mins}m ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return typeof t === "function" ? t("last_seen_hours", { n: hours }) : `${hours}h ago`;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return typeof t === "function" ? t("last_seen_yesterday") : "yesterday";
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatChatStatusLabel(data) {
    if (data?.typing) return typeof t === "function" ? t("status_typing") : "typing...";
    return formatPresenceLabel(data);
  }

  function formatPresenceLabel(data) {
    if (!data || data.hidden) return "";
    if (data.online) return typeof t === "function" ? t("status_online") : "online";
    if (data.last_seen) {
      const time = formatLastSeenTime(data.last_seen);
      return typeof t === "function" ? t("status_last_seen", { time }) : `last seen ${time}`;
    }
    return typeof t === "function" ? t("status_offline") : "offline";
  }

  function applyPresenceDot(dotEl, data) {
    if (!dotEl) return;
    const show = data && data.online && !data.hidden && !data.hide_online;
    dotEl.style.display = show ? "block" : "none";
  }

  function applyPresenceStatus(statusEl, data) {
    applyChatStatus(statusEl, data);
  }

  function applyChatStatus(statusEl, data) {
    if (!statusEl) return;
    const label = formatChatStatusLabel(data);
    statusEl.textContent = label;
    statusEl.style.display = label ? "block" : "none";
    statusEl.classList.toggle("typing", !!(data && data.typing));
    statusEl.classList.toggle("online", !!(data && data.online && !data.typing));
    statusEl.classList.toggle("offline", !(data && (data.online || data.typing)));
  }

  async function loadPresenceSettingsFromServer() {
    if (!getToken()) return { show_online: getShowOnline(), show_last_seen: getShowLastSeen() };
    try {
      const res = await fetch("/api/presence/settings", { headers: authHeaders() });
      if (!res.ok) throw new Error("settings fetch failed");
      const data = await res.json();
      setShowOnline(data.show_online !== false);
      setShowLastSeen(data.show_last_seen !== false);
      return data;
    } catch (e) {
      return { show_online: getShowOnline(), show_last_seen: getShowLastSeen() };
    }
  }

  async function savePresenceSettings(showOnline, showLastSeen) {
    setShowOnline(showOnline);
    setShowLastSeen(showLastSeen);
    sendHeartbeat();
    if (!getToken()) return true;
    try {
      const res = await fetch("/api/presence/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ show_online: showOnline, show_last_seen: showLastSeen }),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  window.getShowOnline = getShowOnline;
  window.getShowLastSeen = getShowLastSeen;
  window.setShowOnline = setShowOnline;
  window.setShowLastSeen = setShowLastSeen;
  window.startPresenceHeartbeat = startPresenceHeartbeat;
  window.stopPresenceHeartbeat = stopPresenceHeartbeat;
  window.fetchPresenceMap = fetchPresenceMap;
  window.formatPresenceLabel = formatPresenceLabel;
  window.formatLastSeenTime = formatLastSeenTime;
  window.applyPresenceDot = applyPresenceDot;
  window.applyPresenceStatus = applyPresenceStatus;
  window.applyChatStatus = applyChatStatus;
  window.formatChatStatusLabel = formatChatStatusLabel;
  window.notifyTyping = notifyTyping;
  window.stopTyping = stopTyping;
  window.loadPresenceSettingsFromServer = loadPresenceSettingsFromServer;
  window.savePresenceSettings = savePresenceSettings;
})();
