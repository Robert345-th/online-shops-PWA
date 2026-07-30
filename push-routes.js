const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const vapidPath = path.join(__dirname, ".vapid-keys.json");
const subsPath = path.join(__dirname, "push-subscriptions.json");
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@zedmarket.app";

/** @type {Map<string, object[]>} */
const pushSubscriptions = new Map();

function loadSubscriptions() {
  try {
    if (!fs.existsSync(subsPath)) return;
    const data = JSON.parse(fs.readFileSync(subsPath, "utf8"));
    for (const [userId, list] of Object.entries(data)) {
      if (Array.isArray(list) && list.length) pushSubscriptions.set(userId, list);
    }
  } catch (err) {
    console.error("Failed to load push subscriptions:", err.message);
  }
}

function saveSubscriptions() {
  try {
    fs.writeFileSync(subsPath, JSON.stringify(Object.fromEntries(pushSubscriptions), null, 2));
  } catch (err) {
    console.error("Failed to save push subscriptions:", err.message);
  }
}

loadSubscriptions();

function loadVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }
  if (fs.existsSync(vapidPath)) {
    return JSON.parse(fs.readFileSync(vapidPath, "utf8"));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidPath, JSON.stringify(keys, null, 2));
  console.log("Generated VAPID keys saved to .vapid-keys.json");
  return keys;
}

const vapidKeys = loadVapidKeys();
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

function getPublicKey() {
  return vapidKeys.publicKey;
}

function addSubscription(userId, subscription) {
  const key = String(userId);
  const list = pushSubscriptions.get(key) || [];
  if (!list.some((s) => s.endpoint === subscription.endpoint)) {
    list.push(subscription);
  }
  pushSubscriptions.set(key, list);
  saveSubscriptions();
}

function removeSubscription(userId, endpoint) {
  const key = String(userId);
  const list = (pushSubscriptions.get(key) || []).filter((s) => s.endpoint !== endpoint);
  if (list.length) pushSubscriptions.set(key, list);
  else pushSubscriptions.delete(key);
  saveSubscriptions();
}

async function sendPushToUser(userId, payload) {
  const subs = pushSubscriptions.get(String(userId)) || [];
  if (!subs.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const dead = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body);
      sent += 1;
    } catch (err) {
      failed += 1;
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
    }
  }

  if (dead.length) {
    const kept = subs.filter((s) => !dead.includes(s.endpoint));
    if (kept.length) pushSubscriptions.set(String(userId), kept);
    else pushSubscriptions.delete(String(userId));
    saveSubscriptions();
  }

  return { sent, failed };
}

async function broadcastPush(payload) {
  let sent = 0;
  for (const userId of pushSubscriptions.keys()) {
    const result = await sendPushToUser(userId, payload);
    sent += result.sent;
  }
  return { sent };
}

function registerPushRoutes(app, getUserIdFromToken) {
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ publicKey: getPublicKey() });
  });

  app.get("/api/push/status", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const subs = pushSubscriptions.get(String(userId)) || [];
    res.json({ user_id: String(userId), subscriptions: subs.length });
  });

  app.post("/api/push/test-self", async (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await sendPushToUser(userId, {
      title: "ZedMarket",
      body: "Message notifications are working!",
      url: "/chat-list.html",
      tag: "push-test",
      icon: "https://zedmarket.app/icon-192.png",
    });
    res.json({ ok: true, user_id: String(userId), ...result });
  });

  app.post("/api/push/subscribe", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const subscription = req.body.subscription;
    if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid subscription" });
    addSubscription(userId, subscription);
    res.json({ ok: true });
  });

  app.delete("/api/push/unsubscribe", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const endpoint = req.body.endpoint;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    removeSubscription(userId, endpoint);
    res.json({ ok: true });
  });

  app.post("/api/push/notify-message", async (req, res) => {
    const senderId = getUserIdFromToken(req.headers.authorization);
    if (!senderId) return res.status(401).json({ error: "Unauthorized" });

    const { recipient_id, sender_name, body, url } = req.body || {};
    const recipientKey = String(recipient_id || "");
    if (!recipientKey || recipientKey === String(senderId)) {
      return res.status(400).json({ error: "Invalid recipient" });
    }

    const preview = (body || "Sent you a message").slice(0, 180);
    const chatUrl = url || `/chat-room.html?userId=${senderId}`;
    const result = await sendPushToUser(recipientKey, {
      title: sender_name || "New message",
      body: preview,
      url: chatUrl,
      tag: `chat-${senderId}`,
      icon: "https://zedmarket.app/icon-192.png",
    });
    res.json({ ok: true, ...result });
  });

  app.post("/api/push/notify", async (req, res) => {
    const secret = req.headers["x-push-secret"] || "";
    if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { user_id, title, body, url, tag } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });
    const result = await sendPushToUser(user_id, {
      title: title || "ZedMarket",
      body: body || "",
      url: url || "/chat-list.html",
      tag: tag || `zedmarket-${user_id}`,
      icon: "https://zedmarket.app/icon-192.png",
    });
    res.json({ ok: true, ...result });
  });

  app.post("/api/push/broadcast", async (req, res) => {
    const secret = req.headers["x-push-secret"] || "";
    if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { title, body, url, tag } = req.body;
    const result = await broadcastPush({
      title: title || "ZedMarket",
      body: body || "",
      url: url || "/",
      tag: tag || "zedmarket-broadcast",
      icon: "https://zedmarket.app/icon-192.png",
    });
    res.json({ ok: true, ...result });
  });
}

module.exports = { registerPushRoutes, sendPushToUser, broadcastPush };
