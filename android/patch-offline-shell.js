/**
 * Shows branded offline screen on cold start with no data (Play Store WebView).
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
const offlineSrc = path.join(__dirname, "offline-shell", "OfflineShellActivity.java");
const offlineDest = path.join(packageDir, "OfflineShellActivity.java");

if (!launcherPath || !fs.existsSync(manifestPath)) {
  console.error("Android project not found. Run: npx bubblewrap update --manifest twa-manifest.json");
  process.exit(1);
}

fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(offlineSrc, offlineDest);
console.log("Copied:", offlineDest);

let launcher = fs.readFileSync(launcherPath, "utf8");

const imports = [
  "import android.content.Context;",
  "import android.net.ConnectivityManager;",
  "import android.net.NetworkCapabilities;",
];

for (const imp of imports) {
  if (!launcher.includes(imp)) {
    launcher = launcher.replace(/(package [^;]+;\s*\n)/, `$1\n${imp}\n`);
  }
}

if (!launcher.includes("isNetworkAvailable()")) {
  const networkHelper = `
    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }
`;
  launcher = launcher.replace(/\n}\s*$/, `\n${networkHelper}\n}\n`);
}

if (launcher.includes("WebViewFallbackActivity.createLaunchIntent") && !launcher.includes("OfflineShellActivity")) {
  launcher = launcher.replace(
    "LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);",
    `if (!isNetworkAvailable()) {
            startActivity(new Intent(this, OfflineShellActivity.class));
            finish();
            return;
        }
        LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);`
  );
  if (!launcher.includes("import android.content.Intent;")) {
    launcher = launcher.replace(/(package [^;]+;\s*\n)/, `$1\nimport android.content.Intent;\n`);
  }
  fs.writeFileSync(launcherPath, launcher);
  console.log("Patched offline check in:", launcherPath);
}

let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes("OfflineShellActivity")) {
  manifest = manifest.replace(
    "<activity android:name=\"com.google.androidbrowserhelper.trusted.WebViewFallbackActivity\"",
    `<activity android:name=".OfflineShellActivity"
            android:exported="false"
            android:theme="@android:style/Theme.NoTitleBar.Fullscreen" />

        <activity android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity"`
  );
  fs.writeFileSync(manifestPath, manifest);
  console.log("Registered OfflineShellActivity in AndroidManifest.xml");
}

console.log("Offline shell ready for next AAB build.");
