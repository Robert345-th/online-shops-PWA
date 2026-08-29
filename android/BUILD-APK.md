# Build ZedMarket Android APK

The download page (**https://zedmarket.app/download.html**) shows **Coming soon** until `public/zedmarket.apk` exists on the server (file must be at least 500 KB).

---

## Fastest way — PWABuilder (no Java on your PC)

1. Open **https://www.pwabuilder.com/**
2. Enter **https://zedmarket.app** and click **Start**
3. Click **Package for stores** → **Android**
4. Use package name: `app.zedmarket.twa`
5. Download the **APK** (not AAB)
6. Save it as `public/zedmarket.apk` in this repo
7. Push to GitHub — Railway redeploys automatically
8. Copy the **SHA-256 fingerprint** from PWABuilder into `public/.well-known/assetlinks.json`

---

## GitHub Actions (build in the cloud)

1. In GitHub: **Settings → Secrets → Actions** → add `APK_KEYSTORE_PASSWORD` (pick a strong password, save it somewhere safe)
2. Go to **Actions → Build Android APK → Run workflow**
3. When it finishes, the APK is pushed to `public/zedmarket.apk` and the download button turns on
4. Copy the SHA-256 from the workflow log into `assetlinks.json` and push again

---

## Local build (Windows)

1. Install **Java JDK 17+** — https://adoptium.net/temurin/releases/?version=17&os=windows&arch=x64
2. From project root:

```cmd
cd android
npm install
npx bubblewrap update --manifest twa-manifest.json
npx bubblewrap build
node copy-apk.js
```

3. Update **asset links**:

```cmd
npx bubblewrap fingerprint list
```

Copy the SHA-256 into `public/.well-known/assetlinks.json`, then deploy.

## Closed-app notifications (Firebase)

The Play Store WebView cannot receive web push after you leave the app. Background pings use Firebase Cloud Messaging.

1. Open [Firebase Console](https://console.firebase.google.com/) → **Add project** → name it `zedmarket`.
2. Add an **Android** app with package name `app.zedmarket.twa`. Download **google-services.json**.
3. GitHub → repo **Settings → Secrets → Actions** → new secret `GOOGLE_SERVICES_JSON` → paste the whole JSON file.
4. Firebase → Project settings → **Service accounts** → Generate new private key. On Railway for `online-shops`, add env var `FIREBASE_SERVICE_ACCOUNT` with that JSON (one line is fine).
5. Push any `android/**` change (or run **Build Android APK**). Install the new APK, Allow notifications, then fully close the app and send yourself a chat.

Until both secrets exist, the APK still builds; closed-app pings stay off.

## Keystore

- First build creates `android/android.keystore` — **back this up safely**
- Use the **same keystore** when you upload to Play Store later

## PWABuilder settings (Play Store)

| Setting | Value |
|---------|--------|
| Package ID | `app.zedmarket.twa` |
| Host | `zedmarket.app` |
| Start URL | `/?utm_source=android` |
| Display | **Fullscreen sticky** |
| Fallback type | **Web View** (not Custom Tabs — hides URL bar on Tecno/Infinix) |
| Monochrome icon URL | `https://zedmarket.app/icon-512.png` (must be absolute) |
| Signing | **Use mine** → `upload.keystore` or package (3) `signing.keystore`, alias `upload`, password `ZmUpload2026!` |

After download, folder must contain **`ZedMarket.aab`** (signed). Never upload `ZedMarket-unsigned.aab`.

## Phone still shows Chrome bar?

1. Update **Google Chrome** from Play Store.
2. **Settings → Apps → Default apps → Browser** → choose **Chrome**.
3. Clear Chrome data, uninstall ZedMarket, restart, reinstall from Internal testing.
4. Rebuild with **Web View** fallback (above) if bar remains.

