const express = require("express");
const path = require("path");
const { registerPushRoutes } = require("./push-routes");

const app = express();
const PORT = process.env.PORT || 3000;
const ONLINE_MS = 90 * 1000;
const TYPING_MS = 5000;

/** @type {Map<string, { lastSeen: number, showOnline?: boolean, showLastSeen?: boolean }>} */
const presenceStore = new Map();
/** @type {Map<string, { at: number }>} */
const typingStore = new Map();

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const part = authHeader.slice(7).split(".")[1];
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    const payload = JSON.parse(json);
    return payload.id ?? payload.userId ?? payload.user_id ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

function presencePayload(entry, now) {
  if (!entry) {
    return { online: false, last_seen: null, hidden: false };
  }
  const online = entry.showOnline !== false && now - entry.lastSeen < ONLINE_MS;
  const lastSeenIso = entry.showLastSeen !== false
    ? new Date(entry.lastSeen).toISOString()
    : null;

  if (entry.showOnline === false && entry.showLastSeen === false) {
    return { online: false, last_seen: null, hidden: true };
  }
  if (entry.showOnline === false) {
    return { online: false, last_seen: lastSeenIso, hidden: false, hide_online: true };
  }
  return { online, last_seen: lastSeenIso, hidden: false };
}

app.use(express.json());

app.use((req, res, next) => {
  if (req.hostname === "www.zedmarket.app") {
    return res.redirect(301, `https://zedmarket.app${req.originalUrl}`);
  }
  next();
});

app.post("/api/presence/heartbeat", (req, res) => {
  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const key = String(userId);
  const existing = presenceStore.get(key) || {};
  if (typeof req.body.show_online === "boolean") existing.showOnline = req.body.show_online;
  if (typeof req.body.show_last_seen === "boolean") existing.showLastSeen = req.body.show_last_seen;
  existing.lastSeen = Date.now();
  presenceStore.set(key, existing);
  res.json({ ok: true });
});

app.post("/api/presence/typing", (req, res) => {
  const fromId = getUserIdFromToken(req.headers.authorization);
  if (!fromId) return res.status(401).json({ error: "Unauthorized" });
  const targetId = req.body.target_user_id;
  if (!targetId) return res.status(400).json({ error: "target_user_id required" });
  const key = `${fromId}:${targetId}`;
  if (req.body.typing === false) {
    typingStore.delete(key);
  } else {
    typingStore.set(key, { at: Date.now() });
  }
  res.json({ ok: true });
});

app.get("/api/presence/batch", (req, res) => {
  const viewerId = getUserIdFromToken(req.headers.authorization);
  const ids = String(req.query.ids || "").split(",").filter(Boolean);
  const includeTyping = req.query.include_typing === "1";
  const now = Date.now();
  const result = {};
  ids.forEach((id) => {
    const payload = presencePayload(presenceStore.get(String(id)), now);
    if (includeTyping && viewerId) {
      const typingEntry = typingStore.get(`${id}:${viewerId}`);
      payload.typing = !!(typingEntry && now - typingEntry.at < TYPING_MS);
    }
    result[id] = payload;
  });
  res.json(result);
});

app.get("/api/presence/settings", (req, res) => {
  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const entry = presenceStore.get(String(userId)) || {};
  res.json({
    show_online: entry.showOnline !== false,
    show_last_seen: entry.showLastSeen !== false,
  });
});

app.put("/api/presence/settings", (req, res) => {
  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const key = String(userId);
  const existing = presenceStore.get(key) || { lastSeen: Date.now() };
  if (typeof req.body.show_online === "boolean") existing.showOnline = req.body.show_online;
  if (typeof req.body.show_last_seen === "boolean") existing.showLastSeen = req.body.show_last_seen;
  presenceStore.set(key, existing);
  res.json({
    show_online: existing.showOnline !== false,
    show_last_seen: existing.showLastSeen !== false,
  });
});

registerPushRoutes(app, getUserIdFromToken);

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ZedMarket PWA running on port ${PORT}`);
});
