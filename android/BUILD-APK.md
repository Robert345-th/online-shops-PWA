# Build ZedMarket Android APK

This creates `public/zedmarket.apk` for the download page at **https://zedmarket.app/download.html**.

## One-time setup (Windows)

1. Install **Java JDK 17+**  
   Download: https://adoptium.net/temurin/releases/?version=17&os=windows&arch=x64  

2. Install **Android command-line tools** (or Android Studio)  
   Bubblewrap will prompt to download the SDK on first run.

3. From the project root:

```cmd
cd android
npm install
npx bubblewrap update --manifest twa-manifest.json
npx bubblewrap build
```

4. Copy the APK to the website:

```cmd
copy app-release-signed.apk ..\public\zedmarket.apk
```

5. Update **asset links** (so the app opens full-screen without a browser bar):

```cmd
npx bubblewrap fingerprint list
```

Copy the SHA-256 fingerprint into `public/.well-known/assetlinks.json`, then deploy.

## Keystore

- First build creates `android/android.keystore` — **back this up safely**.
- Use the **same keystore** when you upload to Play Store later.

## Deploy

Push to GitHub so Railway redeploys. Users can then download from:

**https://zedmarket.app/download.html**
