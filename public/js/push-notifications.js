(function () {
  const PUSH_ENABLED_KEY = "zm_push_enabled";
  const PUSH_OPT_OUT_KEY = "zm_push_opt_out";
  const ICON_URL = "https://zedmarket.app/icon-192.png";

  function getToken() {
    return localStorage.getItem("zm_token");
  }

  function isPushEnabled() {
    return localStorage.getItem(PUSH_ENABLED_KEY) === "true";
  }

  function isPushOptOut() {
    return localStorage.getItem(PUSH_OPT_OUT_KEY) === "true";
  }

  function setPushOptOut(value) {
    localStorage.setItem(PUSH_OPT_OUT_KEY, value ? "true" : "false");
  }

  function setPushEnabled(value) {
    localStorage.setItem(PUSH_ENABLED_KEY, value ? "true" : "false");
  }

  function getNativeBridge() {
    return window.ZedMarketLocation || null;
  }

  function nativeHasNotifyPermission() {
    const bridge = getNativeBridge();
    if (!bridge || typeof bridge.hasNotificationPermission !== "function") return false;
    try {
      return !!bridge.hasNotificationPermission();
    } catch (e) {
      return false;
    }
  }

  function nativeShowNotification(title, body, url) {
    const bridge = getNativeBridge();
    if (!bridge || typeof bridge.showNotification !== "function") return false;
    try {
      bridge.showNotification(String(title || "ZedMarket"), String(body || ""), String(url || "/chat-list.html"));
      return true;
    } catch (e) {
      return false;
    }
  }

  function notificationsAllowed() {
    if (nativeHasNotifyPermission()) return true;
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }

  function isPushSupported() {
    if (getNativeBridge()) return true;
    return typeof Notification !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window;
  }

  async function registerNativeFcmToken() {
    const auth = getToken();
    const apiUrl = window.ZM_API_URL;
    if (!auth || !apiUrl) return false;
    const bridge = getNativeBridge();
    let fcm = "";
    if (window.__zmFcmToken) fcm = String(window.__zmFcmToken);
    if (!fcm && bridge && typeof bridge.getFcmToken === "function") {
      try { fcm = String(bridge.getFcmToken() || ""); } catch (e) { fcm = ""; }
    }
    if (!fcm) return false;
    try {
      const res = await fetch(`${apiUrl}/notifications/save-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth}`,
        },
        body: JSON.stringify({ token: fcm }),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function sendTestPushNotification() {
    if (nativeShowNotification("ZedMarket", typeof t === "function" ? t("push_on_body") : "Notifications are on. You will get a ping for new messages.", "/chat-list.html")) {
      return true;
    }
    const token = getToken();
    if (token) {
      try {
        const res = await fetch("/api/push/test-self", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sent > 0) return true;
        }
      } catch (e) {}
    }
    if (notificationsAllowed()) {
      await showLocalMessageNotification("ZedMarket", typeof t === "function" ? t("push_on_body") : "Notifications are on.", "/chat-list.html");
      return true;
    }
    return false;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function ensureServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;
    return navigator.serviceWorker.register("/service-worker.js");
  }

  async function subscribeToPush() {
    const token = getToken();
    if (!token) throw new Error("not_logged_in");

    const registration = await ensureServiceWorker();
    if (!registration) throw new Error("unsupported");

    await navigator.serviceWorker.ready;

    const keyRes = await fetch("/api/push/vapid-public-key");
    if (!keyRes.ok) throw new Error("vapid_unavailable");
    const { publicKey } = await keyRes.json();
    if (!publicKey) throw new Error("vapid_unavailable");

    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      try { await subscription.unsubscribe(); } catch { /* ignore */ }
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) throw new Error("subscribe_failed");

    setPushEnabled(true);
    return subscription;
  }

  async function unsubscribeFromPush() {
    if (!("serviceWorker" in navigator)) {
      setPushEnabled(false);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const token = getToken();

    if (subscription && token) {
      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
      await subscription.unsubscribe();
    }
    setPushEnabled(false);
  }

  async function enablePushNotifications() {
    if (nativeHasNotifyPermission()) {
      setPushEnabled(true);
      setPushOptOut(false);
      try { await registerNativeFcmToken(); } catch (e) {}
      if (isPushSupported() && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { await subscribeToPush(); } catch (e) { /* WebView often cannot use web push */ }
      }
      return true;
    }

    const bridge = getNativeBridge();
    if (bridge && typeof bridge.requestNotificationPermission === "function") {
      try { bridge.requestNotificationPermission(); } catch (e) {}
      return false;
    }

    if (!isPushSupported()) throw new Error("unsupported");
    if (typeof Notification === "undefined") throw new Error("unsupported");

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") throw new Error("denied");

    await subscribeToPush();
    try { await sendTestPushNotification(); } catch (e) {}
    return true;
  }

  async function syncPushSubscription() {
    if (!getToken()) return;
    if (nativeHasNotifyPermission()) {
      setPushOptOut(false);
      setPushEnabled(true);
      try { await registerNativeFcmToken(); } catch (e) {}
    }
    if (!isPushSupported()) return;
    const webGranted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (webGranted) setPushOptOut(false);
    if (!webGranted && !nativeHasNotifyPermission()) {
      setPushEnabled(false);
      return;
    }
    if (nativeHasNotifyPermission() && !webGranted) return;
    try {
      const registration = await ensureServiceWorker();
      if (!registration) return;
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        await subscribeToPush();
        return;
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok && !nativeHasNotifyPermission()) setPushEnabled(false);
    } catch (e) {
      if (!nativeHasNotifyPermission()) setPushEnabled(false);
    }
  }

  async function autoEnablePushNotifications() {
    if (notificationsAllowed()) {
      setPushOptOut(false);
    }

    const bridge = getNativeBridge();
    if (bridge && typeof bridge.requestNotificationPermission === "function") {
      try {
        bridge.requestNotificationPermission();
      } catch (e) { /* native ask is best-effort */ }
    }

    if (!getToken()) return false;

    try {
      if (notificationsAllowed()) {
        setPushEnabled(true);
        await syncPushSubscription();
        try { await registerNativeFcmToken(); } catch (e) {}
        return true;
      }

      if (typeof Notification !== "undefined" && Notification.permission === "denied" && !nativeHasNotifyPermission()) {
        return false;
      }
      if (sessionStorage.getItem("zm_push_auto_tried") === "1") return false;
      sessionStorage.setItem("zm_push_auto_tried", "1");
      await enablePushNotifications();
      return true;
    } catch (e) {
      return false;
    }
  }

  async function refreshPushToggle(toggleEl) {
    if (!toggleEl) return;
    if (!isPushSupported()) {
      toggleEl.disabled = true;
      toggleEl.checked = false;
      return;
    }
    toggleEl.disabled = false;
    if (isPushOptOut()) {
      toggleEl.checked = false;
      return;
    }
    toggleEl.checked = true;
    if (notificationsAllowed()) {
      setPushEnabled(true);
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      toggleEl.checked = !isPushOptOut();
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) setPushEnabled(true);
    } catch (e) {}
  }

  function messagePreview(payload) {
    if (payload.content) return payload.content;
    if (payload.photo_url) return "📷 Photo";
    if (payload.audio_url) return "🎤 Voice message";
    return "New message";
  }

  async function notifyMessagePush(recipientId, payload) {
    const token = getToken();
    if (!token || !recipientId) return;
    try {
      const res = await fetch("/api/push/notify-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient_id: recipientId,
          sender_name: payload.sender_name || "Someone",
          body: payload.body || "New message",
          url: payload.url || "/chat-list.html",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sent === 0) console.warn("Push not delivered — recipient has no active subscription.");
      }
    } catch (e) {}
  }

  async function showLocalMessageNotification(title, body, url) {
    if (isPushOptOut()) return;
    if (nativeShowNotification(title, body, url)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const options = {
      body,
      icon: ICON_URL,
      badge: ICON_URL,
      tag: `chat-${title}`,
      data: { url: url || "/chat-list.html" },
    };
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return;
      }
      new Notification(title, options);
    } catch (e) {}
  }

  let messagePollTimer = null;
  let messageUnreadCache = new Map();

  async function pollMessageNotifications(apiUrl, token, userId) {
    if (isPushOptOut() || !token || !userId) return;
    try {
      const res = await fetch(`${apiUrl}/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (window.handleAuthResponse && !handleAuthResponse(res)) return;
      if (!res.ok) return;
      const conversations = await res.json();
      conversations.forEach((conv) => {
        const id = conv.other_user_id;
        const prevUnread = messageUnreadCache.get(id) || 0;
        const nextUnread = parseInt(conv.unread_count, 10) || 0;
        if (nextUnread > prevUnread && conv.sender_id !== userId) {
          const preview = conv.last_message || "New message";
          showLocalMessageNotification(
            conv.other_user_name || "ZedMarket",
            preview,
            `/chat-room.html?userId=${id}&name=${encodeURIComponent(conv.other_user_name || "")}`
          );
        }
        messageUnreadCache.set(id, nextUnread);
      });
    } catch (e) {}
  }

  function startMessageNotificationPoll(apiUrl, token, userId) {
    if (messagePollTimer || isPushOptOut()) return;
    if (/chat-list\.html/i.test(location.pathname)) return;
    pollMessageNotifications(apiUrl, token, userId);
    messagePollTimer = setInterval(() => {
      pollMessageNotifications(apiUrl, token, userId);
    }, 12000);
    window.addEventListener("pagehide", stopMessageNotificationPoll);
  }

  function stopMessageNotificationPoll() {
    if (messagePollTimer) {
      clearInterval(messagePollTimer);
      messagePollTimer = null;
    }
  }

  window.isPushOptOut = isPushOptOut;
  window.setPushOptOut = setPushOptOut;
  window.autoEnablePushNotifications = autoEnablePushNotifications;
  window.isPushSupported = isPushSupported;
  window.isPushEnabled = isPushEnabled;
  window.setPushEnabled = setPushEnabled;
  window.enablePushNotifications = enablePushNotifications;
  window.unsubscribeFromPush = unsubscribeFromPush;
  window.syncPushSubscription = syncPushSubscription;
  window.refreshPushToggle = refreshPushToggle;
  window.notifyMessagePush = notifyMessagePush;
  window.messagePreview = messagePreview;
  window.sendTestPushNotification = sendTestPushNotification;
  window.notificationsAllowed = notificationsAllowed;
  window.showLocalMessageNotification = showLocalMessageNotification;
  window.startMessageNotificationPoll = startMessageNotificationPoll;
  window.stopMessageNotificationPoll = stopMessageNotificationPoll;
  window.registerNativeFcmToken = registerNativeFcmToken;
})();
