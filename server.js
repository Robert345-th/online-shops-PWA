const express = require("express");
const compression = require("compression");
const fs = require("fs");
const jwt = require("jsonwebtoken");
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
  const token = authHeader.slice(7);
  if (process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return payload.userId ?? payload.id ?? payload.user_id ?? payload.sub ?? null;
    } catch {
      return null;
    }
  }
  try {
    const part = token.split(".")[1];
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

app.use(compression());
app.use(express.json());

app.use((req, res, next) => {
  if (req.hostname === "www.zedmarket.app") {
    if (req.path === "/.well-known/assetlinks.json") return next();
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

const MIN_APK_BYTES = 500_000;

function getApkPath() {
  return path.join(__dirname, "public", "zedmarket.apk");
}

function apkIsReady() {
  try {
    const apkPath = getApkPath();
    return fs.existsSync(apkPath) && fs.statSync(apkPath).size >= MIN_APK_BYTES;
  } catch {
    return false;
  }
}

registerPushRoutes(app, getUserIdFromToken);

const LISTING_API = process.env.API_URL || "https://online-shops-production.up.railway.app";
const SITE_URL = "https://zedmarket.app";

function isShareCrawler(userAgent) {
  return /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot/i.test(userAgent || "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listingPhotoUrl(listing) {
  let photos = listing && listing.photos;
  if (typeof photos === "string") {
    try { photos = JSON.parse(photos); } catch { photos = []; }
  }
  const first = Array.isArray(photos) && photos[0] ? String(photos[0]) : "";
  if (first.startsWith("https://")) return first;
  return `${SITE_URL}/icon-512.png`;
}

function listingOgHtml(listing, url) {
  const price = Number(listing.price);
  const priceLabel = Number.isFinite(price)
    ? `K${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "";
  const title = [listing.title, priceLabel].filter(Boolean).join(" — ") + " | ZedMarket";
  const description = [
    listing.location_label,
    listing.category,
    listing.condition,
    "On ZedMarket — register or log in to view.",
  ].filter(Boolean).join(" · ");
  const image = listingPhotoUrl(listing);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="product" />
<meta property="og:site_name" content="ZedMarket" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body></body>
</html>`;
}

app.get("/listing.html", async (req, res, next) => {
  const id = String(req.query.id || "").replace(/\D/g, "");
  if (!id || !isShareCrawler(req.get("user-agent"))) return next();
  try {
    const apiRes = await fetch(`${LISTING_API}/listings/${id}`);
    if (!apiRes.ok) return next();
    const listing = await apiRes.json();
    if (!listing || listing.error || !listing.id) return next();
    const url = `${SITE_URL}/listing.html?id=${id}`;
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.type("html").send(listingOgHtml(listing, url));
  } catch (e) {
    return next();
  }
});


app.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.type("application/json");
  res.sendFile(path.join(__dirname, "public", ".well-known", "assetlinks.json"));
});

app.head("/zedmarket.apk", (req, res) => {
  if (!apkIsReady()) return res.status(404).end();
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Length", String(fs.statSync(getApkPath()).size));
  res.end();
});

app.get("/zedmarket.apk", (req, res) => {
  if (!apkIsReady()) {
    return res.status(404).json({ error: "APK not available yet. Use Chrome install or try again later." });
  }
  res.download(getApkPath(), "ZedMarket.apk");
});

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
