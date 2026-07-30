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

    const keyRes = await fetch("/api/push/vapid-public-key");
    if (!keyRes.ok) throw new Error("vapid_unavailable");
    const { publicKey } = await keyRes.json();

    const subscription = await registration.pushManager.subscribe({
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
    if (!isPushSupported()) throw new Error("unsupported");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("denied");
    return subscribeToPush();
  }

  async function syncPushSubscription() {
    if (!isPushEnabled() || !getToken() || !isPushSupported()) return;
    try {
      const registration = await ensureServiceWorker();
      if (!registration) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && Notification.permission === "granted") {
        await subscribeToPush();
        return;
      }
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      }
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
      await fetch("/api/push/notify-message", {
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
    } catch (e) {}
  }

  function showLocalMessageNotification(title, body, url) {
    if (!isPushEnabled() || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    try {
      const n = new Notification(title, {
        body,
        icon: ICON_URL,
        tag: `chat-${title}`,
        data: { url },
      });
      n.onclick = () => {
        window.focus();
        if (url) window.location.href = url;
        n.close();
      };
    } catch (e) {}
  }

  window.isPushSupported = isPushSupported;
  window.isPushEnabled = isPushEnabled;
  window.setPushEnabled = setPushEnabled;
  window.enablePushNotifications = enablePushNotifications;
  window.unsubscribeFromPush = unsubscribeFromPush;
  window.syncPushSubscription = syncPushSubscription;
  window.notifyMessagePush = notifyMessagePush;
  window.messagePreview = messagePreview;
  window.showLocalMessageNotification = showLocalMessageNotification;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
})();
