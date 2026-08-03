/**
 * Play Store testing app: custom WebView with native location retry + Settings fallback.
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
const stringsPath = path.join(__dirname, "app", "src", "main", "res", "values", "loc_strings.xml");

if (!launcherPath || !fs.existsSync(manifestPath)) {
  console.error("Android project not found. Run: npx bubblewrap update --manifest twa-manifest.json");
  process.exit(1);
}

fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(webViewSrc, webViewDest);
console.log("Copied:", webViewDest);

if (fs.existsSync(stringsPath)) {
  console.log("Location strings:", stringsPath);
}

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

if (!manifest.includes(".ZedMarketWebViewActivity")) {
  manifest = manifest.replace(
    "<activity android:name=\"com.google.androidbrowserhelper.trusted.WebViewFallbackActivity\"\n            android:configChanges=\"orientation|screenSize\" />",
    `<activity android:name=".ZedMarketWebViewActivity"
            android:configChanges="orientation|screenSize"
            android:exported="false" />

        <activity android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity"
            android:configChanges="orientation|screenSize" />`
  );
  fs.writeFileSync(manifestPath, manifest);
  console.log("Registered ZedMarketWebViewActivity + location permissions in AndroidManifest.xml");
} else {
  fs.writeFileSync(manifestPath, manifest);
  console.log("AndroidManifest already patched for location.");
}

console.log("Native location handling ready for next AAB build (Internal testing).");
