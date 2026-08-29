/**
 * Wire Firebase Cloud Messaging so closed-app pings work.
 * Run after bubblewrap update + the other patch-*.js scripts.
 *
 * If GOOGLE_SERVICES_JSON (env) or webview-shell/google-services.json is present,
 * the google-services plugin is applied. Without it the APK still builds;
 * getToken() no-ops until the file is added.
 */
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "app");
const gradlePath = path.join(appDir, "build.gradle");
const rootGradlePath = path.join(__dirname, "build.gradle");
const manifestPath = path.join(appDir, "src", "main", "AndroidManifest.xml");
const packageDir = path.join(appDir, "src", "main", "java", "app", "zedmarket", "twa");
const shellDir = path.join(__dirname, "webview-shell");

function copyJava(name) {
  const src = path.join(shellDir, name);
  const dest = path.join(packageDir, name);
  if (!fs.existsSync(src) || !fs.existsSync(packageDir)) return false;
  fs.copyFileSync(src, dest);
  console.log("Copied:", dest);
  return true;
}

if (!fs.existsSync(gradlePath) || !fs.existsSync(manifestPath)) {
  console.error("Android project not found. Run bubblewrap update first.");
  process.exit(1);
}

copyJava("ZedMarketNotifier.java");
copyJava("ZedMarketFcmService.java");
copyJava("ZedMarketAuthStore.java");
copyJava("ZedMarketReplyReceiver.java");

let gradle = fs.readFileSync(gradlePath, "utf8");
if (!gradle.includes("firebase-messaging")) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    `dependencies {
    implementation 'com.google.firebase:firebase-messaging:24.1.0'`
  );
  console.log("Added firebase-messaging.");
}

const jsonFromEnv = process.env.GOOGLE_SERVICES_JSON;
const jsonFromFile = [
  path.join(shellDir, "google-services.json"),
  path.join(__dirname, "google-services.json"),
].find((p) => fs.existsSync(p));

let jsonText = "";
if (jsonFromEnv && jsonFromEnv.trim()) {
  jsonText = jsonFromEnv.trim();
} else if (jsonFromFile) {
  jsonText = fs.readFileSync(jsonFromFile, "utf8");
}

if (jsonText) {
  fs.writeFileSync(path.join(appDir, "google-services.json"), jsonText);
  console.log("Wrote app/google-services.json");

  if (fs.existsSync(rootGradlePath)) {
    let root = fs.readFileSync(rootGradlePath, "utf8");
    if (!root.includes("com.google.gms:google-services")) {
      root = root.replace(
        /classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"]/,
        (m) => `${m}\n        classpath 'com.google.gms:google-services:4.4.2'`
      );
      fs.writeFileSync(rootGradlePath, root);
      console.log("Added google-services classpath.");
    }
  }

  if (!gradle.includes("com.google.gms.google-services")) {
    gradle = gradle.trimEnd() + "\n\napply plugin: 'com.google.gms.google-services'\n";
    console.log("Applied google-services plugin.");
  }
} else {
  console.log("No google-services.json — FCM token fetch will no-op until the secret is set.");
}

fs.writeFileSync(gradlePath, gradle);

let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes("ZedMarketFcmService")) {
  const serviceXml = `
        <service
            android:name=".ZedMarketFcmService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
        <receiver
            android:name=".ZedMarketReplyReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="app.zedmarket.twa.REPLY" />
            </intent-filter>
        </receiver>
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="zedmarket_messages" />`;
  if (manifest.includes("</application>")) {
    manifest = manifest.replace("</application>", `${serviceXml}\n    </application>`);
    fs.writeFileSync(manifestPath, manifest);
    console.log("Registered ZedMarketFcmService in AndroidManifest.xml");
  }
}

if (!manifest.includes("ZedMarketReplyReceiver") && manifest.includes("</application>")) {
  const receiverXml = `
        <receiver
            android:name=".ZedMarketReplyReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="app.zedmarket.twa.REPLY" />
            </intent-filter>
        </receiver>`;
  manifest = manifest.replace("</application>", `${receiverXml}\n    </application>`);
  fs.writeFileSync(manifestPath, manifest);
  console.log("Registered ZedMarketReplyReceiver in AndroidManifest.xml");
}

if (!manifest.includes("OPEN_ZEDMARKET") && manifest.includes(".ZedMarketWebViewActivity")) {
  manifest = manifest.replace(
    /(<activity android:name="\.ZedMarketWebViewActivity"[\s\S]*?)(<\/activity>)/,
    `$1            <intent-filter>
                <action android:name="OPEN_ZEDMARKET" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        $2`
  );
  fs.writeFileSync(manifestPath, manifest);
  console.log("Added OPEN_ZEDMARKET click action.");
}

console.log("FCM patch ready.");
