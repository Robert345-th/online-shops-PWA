# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**ZedMarket** — a buy/sell marketplace PWA for Zambia. This repo is the **frontend + thin edge server only**:

- `public/` — the entire web app: plain multi-page HTML/CSS/JS (no framework, no bundler, no build step). Each page is a standalone `.html` file that includes shared scripts from `public/js/` directly via `<script src="/js/...">` tags.
- `server.js` + `push-routes.js` — a small Express server whose only jobs are: serve `public/` statically, host a couple of stateful-but-ephemeral endpoints (presence/typing, web push), serve the Android APK download, and redirect `www.zedmarket.app` → `zedmarket.app`.
- `android/` — Android TWA (Trusted Web Activity) packaging via Bubblewrap, built by CI into a signed APK/AAB.

**The real backend (auth, listings, chat, shops, admin, etc.) lives in a separate repo/service**, deployed at `https://online-shops-production.up.railway.app` (Railway). It is hardcoded as `API_URL` in `public/js/utils.js`. Every page's data fetching talks to that API directly from the browser — this repo has no database and no business-logic API beyond presence/push. Do not go looking here for listing/user/chat/order logic; it isn't in this codebase.

## Commands

No test suite, linter, or build step exists in this repo.

```bash
npm start                 # node server.js — runs the Express server locally (default port 3000)
npm run generate-icons    # regenerate PNG icons from public/assets/*.svg via sharp
```

Frontend pages are static files — edit HTML/CSS/JS in `public/` directly and reload; there is no compile/watch step. `npm start` is only needed to exercise `server.js`'s own routes (presence, push, APK download, assetlinks redirect); for pure front-end editing, opening the HTML via any static file server (or `npm start`) works.

Deployment is Railway (`Procfile` / `nixpacks.toml` both just run `node server.js`); pushing to `main` deploys.

### Android APK

`android/` is a separate npm project (`android/package.json`), not part of the root install:

```bash
cd android
npm install
npm run build       # sync TWA manifest, apply patch-*.js scripts, bubblewrap build, copy APK into public/zedmarket.apk
npm run fingerprint  # print signing SHA-256 for public/.well-known/assetlinks.json
```

This is normally done by `.github/workflows/build-apk.yml` (`workflow_dispatch` or on push to `android/**`), which generates/restores a signing keystore from the `APK_KEYSTORE_PASSWORD` secret, builds, and commits the resulting `public/zedmarket.apk` back to the repo. See `android/BUILD-APK.md` for the full manual/PWABuilder/CI walkthrough and Play Store signing notes. The download page (`public/download.html`) only enables the download once `public/zedmarket.apk` exists and is ≥500KB (`server.js`'s `apkIsReady`).

## Architecture notes

**Auth model**: JWT stored in `localStorage` as `zm_token` (+ `zm_user`). `public/js/utils.js` is included on every page and provides the shared auth/session plumbing:
- `zmIsLoggedIn()`, `zmRequireLogin()`, `zmLoginUrl()` — client-side gating, redirecting to `/login.html?next=...`.
- A monkey-patched `window.fetch` (`installFetchAuthGuard`) inspects every response to API calls (Railway origin or same-origin `/api/*`) for `401` (clears auth, redirects to login) or `403` with a suspended-account signal (forces logout via `forceLogoutSuspended`).
- A polling `startSessionWatch()` (every 4s while a page with auth is open) hits `${API_URL}/auth/session` to catch server-side suspension/logout promptly, plus a service-worker message channel (`type: "force_logout"`) for the same purpose.
- Server-side auth in *this* repo (`server.js`'s `getUserIdFromToken`) only decodes/verifies the JWT to extract a user id for the presence/push endpoints — it does not issue tokens or own user records; that's the Railway API's job. If `JWT_SECRET` env var is set it verifies the signature, otherwise it just base64-decodes the payload unverified (local/dev fallback).

**Presence & typing (`server.js`)**: in-memory `Map`s (`presenceStore`, `typingStore`) — no persistence, resets on server restart/redeploy. Heartbeats mark a user online; typing entries expire after `TYPING_MS` (5s); presence entries are considered "online" within `ONLINE_MS` (90s). Users can hide online status / last-seen independently via `/api/presence/settings`.

**Web push (`push-routes.js`)**: subscriptions persisted to a local JSON file (`push-subscriptions.json`, gitignored) rather than a database — fine for a single Railway instance, would need rework to scale beyond one. VAPID keys are similarly generated once and cached to `.vapid-keys.json` (or taken from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars). `/api/push/notify` and `/api/push/broadcast` are server-to-server endpoints gated by the `PUSH_WEBHOOK_SECRET` header (`x-push-secret`) — intended to be called by the Railway backend when a chat message/order event happens, not by the browser.

**Shared front-end scripts (`public/js/`)**, all loaded ad-hoc per page (check each `.html`'s `<head>`/bottom `<script>` tags — there's no central manifest):
- `utils.js` — must load first on most pages; auth guard, dark-mode CSS injection, and a lightweight nav-speed layer (top loading bar + same-origin link prefetching + sessionStorage listing cache for instant listing-page navigation).
- `android-chrome.js` — detects/adjusts behavior when running inside the TWA/WebView shell vs. real Chrome.
- `service-worker.js` (root, not `/js/`) — app-shell precache (`PRECACHE` list) for offline support (`offline.html` fallback); bump the `CACHE` version string when changing precached assets.
- `lang.js` — large (1500+ line) i18n string table/translation helper.
- `bottom-nav.js`, `app-touch.js`, `data-saver.js`, `dob-picker.js`, `location.js`, `phone.js`, `presence.js`, `chat-receipts.js`, `push-notifications.js`, `pwa-install.js`, `shop-gate.js`, `upload.js` — single-purpose helpers for one UI concern each (mobile nav chrome, touch gestures, low-data mode, date-of-birth picker, geolocation, phone input formatting, presence UI, chat read-receipts, push subscribe flow, install prompt, shop-registration gating, file uploads). Grep the relevant `.html` file's script tags before assuming a helper applies globally — inclusion is per-page, not global.

**Multi-page structure**: each `.html` file in `public/` is a full page for one feature (listings, shop management, chat, wanted-ads, admin, referrals, boosts, etc.) with its own inline `<script>` for page logic, calling straight through to the Railway API via `fetch`. There's no router or shared layout system — shared chrome (bottom nav, dark mode, auth) is reassembled per-page by including the same `js/*.js` files.
