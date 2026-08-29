/**
 * Play Store testing app: custom WebView with native location retry + Settings fallback,
 * plus microphone/camera permission for voice notes and selfie capture.
 * Run after: node patch-webview-only.js
 */
const fs = require("fs");
const path = require("path");

function findLauncherActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findLauncherActivity(full);
      if (found) return found;
    } else if (entry.name === "LauncherActivity.java") {
      return full;
    }
  }
  return null;
}

const packageDir = path.join(__dirname, "app", "src", "main", "java", "app", "zedmarket", "twa");
const launcherPath = findLauncherActivity(path.join(__dirname, "app", "src", "main", "java"));
const manifestPath = path.join(__dirname, "app", "src", "main", "AndroidManifest.xml");
const webViewSrc = path.join(__dirname, "webview-shell", "ZedMarketWebViewActivity.java");
const webViewDest = path.join(packageDir, "ZedMarketWebViewActivity.java");
const locStringsSrc = path.join(__dirname, "webview-shell", "loc_strings.xml");
const locStringsDest = path.join(__dirname, "app", "src", "main", "res", "values", "loc_strings.xml");

if (!launcherPath || !fs.existsSync(manifestPath)) {
  console.error("Android project not found. Run: npx bubblewrap update --manifest twa-manifest.json");
  process.exit(1);
}

fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(webViewSrc, webViewDest);
console.log("Copied:", webViewDest);

fs.mkdirSync(path.dirname(locStringsDest), { recursive: true });
fs.copyFileSync(locStringsSrc, locStringsDest);
console.log("Copied:", locStringsDest);

let launcher = fs.readFileSync(launcherPath, "utf8");

if (!launcher.includes("ZedMarketWebViewActivity")) {
  launcher = launcher.replace(
    /import com\.google\.androidbrowserhelper\.trusted\.WebViewFallbackActivity;/,
    "import app.zedmarket.twa.ZedMarketWebViewActivity;"
  );
  launcher = launcher.replace(
    "Intent intent = WebViewFallbackActivity.createLaunchIntent(this, getLaunchingUrl(), metadata);",
    "Intent intent = ZedMarketWebViewActivity.createLaunchIntent(this, getLaunchingUrl(), metadata);"
  );
  fs.writeFileSync(launcherPath, launcher);
  console.log("Patched launcher to use ZedMarketWebViewActivity:", launcherPath);
} else {
  console.log("Launcher already uses ZedMarketWebViewActivity.");
}

let manifest = fs.readFileSync(manifestPath, "utf8");

if (!manifest.includes("ACCESS_FINE_LOCATION")) {
  manifest = manifest.replace(
    "<uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\"/>",
    "<uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\"/>\n    \n        <uses-permission android:name=\"android.permission.ACCESS_COARSE_LOCATION\"/>\n    \n        <uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\"/>"
  );
}

if (!manifest.includes("RECORD_AUDIO")) {
  const anchor = manifest.includes("ACCESS_FINE_LOCATION")
    ? "<uses-permission android:name=\"android.permission.ACCESS_FINE_LOCATION\"/>"
    : "<uses-permission android:name=\"android.permission.POST_NOTIFICATIONS\"/>";
  if (manifest.includes(anchor)) {
    manifest = manifest.replace(
      anchor,
      `${anchor}\n    \n        <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n    \n        <uses-permission android:name="android.permission.CAMERA"/>\n    \n        <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>`
    );
    console.log("Added RECORD_AUDIO + CAMERA permissions to AndroidManifest.xml");
  }
}

const webViewLauncherActivity = `<activity android:name=".ZedMarketWebViewActivity"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboard|keyboardHidden|smallestScreenSize|screenLayout"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:theme="@android:style/Theme.Black.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>`;

if (!manifest.includes(".ZedMarketWebViewActivity")) {
  manifest = manifest.replace(
    "<activity android:name=\"com.google.androidbrowserhelper.trusted.WebViewFallbackActivity\"\n            android:configChanges=\"orientation|screenSize\" />",
    `${webViewLauncherActivity}

        <activity android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity"
            android:configChanges="orientation|screenSize" />`
  );
  console.log("Registered ZedMarketWebViewActivity as the home-screen launcher.");
} else {
  manifest = manifest.replace(
    /<activity android:name="\.ZedMarketWebViewActivity"[\s\S]*?(?:\/>|<\/activity>)/,
    webViewLauncherActivity
  );
  console.log("Updated ZedMarketWebViewActivity to be the home-screen launcher.");
}

// Stop Chrome TWA from owning the app icon (that is what shows the URL bar).
const withoutTwaIcon = manifest.replace(
  /<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"\s*\/>\s*<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>\s*<\/intent-filter>/g,
  (match, offset, whole) => {
    const before = whole.lastIndexOf("<activity", offset);
    const slice = whole.slice(before, offset);
    if (slice.includes("ZedMarketWebViewActivity")) return match;
    return "<!-- Chrome TWA launcher icon removed -->";
  }
);
manifest = withoutTwaIcon;

if (!manifest.includes('android:name=".ZedMarketWebViewActivity"')
    || !manifest.includes("android.intent.category.LAUNCHER")) {
  console.error("Failed to make ZedMarketWebViewActivity the home-screen launcher.");
  process.exit(1);
}

manifest = manifest.replace(
  /<activity\b([^>]*?)(\s*\/>|>)/g,
  (full, attrs, end) => {
    if (/android:screenOrientation=/.test(attrs)) {
      return `<activity${attrs.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="portrait"')}${end}`;
    }
    return `<activity${attrs}\n            android:screenOrientation="portrait"${end}`;
  }
);

fs.writeFileSync(manifestPath, manifest);

console.log("Native location + microphone handling ready for next AAB build.");
