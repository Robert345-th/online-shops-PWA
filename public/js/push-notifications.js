(function () {
  const PUSH_ENABLED_KEY = "zm_push_enabled";
  const ICON_URL = "https://www.zedmarket.app/icon-192.png";

  function getToken() {
    return localStorage.getItem("zm_token");
  }

  function isPushEnabled() {
    return localStorage.getItem(PUSH_ENABLED_KEY) === "true";
  }

  function setPushEnabled(value) {
    localStorage.setItem(PUSH_ENABLED_KEY, value ? "true" : "false");
  }

  function isPushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
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

  async function sendTestPush() {
    const token = getToken();
    if (!token) throw new Error("not_logged_in");
    const res = await fetch("/api/push/test-self", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("test_failed");
    const data = await res.json();
    if (!data.sent) throw new Error("not_registered");
    return data;
  }

  async function enablePushNotifications() {
    if (!isPushSupported()) throw new Error("unsupported");

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") throw new Error("denied");

    await subscribeToPush();
    await sendTestPush();
    return true;
  }

  async function syncPushSubscription() {
    if (!isPushEnabled() || !getToken() || !isPushSupported()) return;
    if (Notification.permission !== "granted") {
      setPushEnabled(false);
      return;
    }
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
      if (!res.ok) setPushEnabled(false);
    } catch (e) {
      setPushEnabled(false);
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
    if (!isPushEnabled() || Notification.permission !== "granted") {
      toggleEl.checked = false;
      if (Notification.permission !== "granted") setPushEnabled(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      toggleEl.checked = !!subscription;
      if (!subscription) setPushEnabled(false);
    } catch (e) {
      toggleEl.checked = false;
      setPushEnabled(false);
    }
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
    if (!isPushEnabled() || Notification.permission !== "granted") return;
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
    if (!isPushEnabled() || !token || !userId) return;
    try {
      const res = await fetch(`${apiUrl}/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    if (messagePollTimer || !isPushEnabled()) return;
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

  window.isPushSupported = isPushSupported;
  window.isPushEnabled = isPushEnabled;
  window.setPushEnabled = setPushEnabled;
  window.enablePushNotifications = enablePushNotifications;
  window.unsubscribeFromPush = unsubscribeFromPush;
  window.syncPushSubscription = syncPushSubscription;
  window.refreshPushToggle = refreshPushToggle;
  window.notifyMessagePush = notifyMessagePush;
  window.messagePreview = messagePreview;
  window.showLocalMessageNotification = showLocalMessageNotification;
  window.startMessageNotificationPoll = startMessageNotificationPoll;
  window.stopMessageNotificationPoll = stopMessageNotificationPoll;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
})();
