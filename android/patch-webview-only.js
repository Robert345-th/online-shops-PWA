/**
 * Force the Play Store app to launch in a full-screen WebView.
 * Without this, Bubblewrap uses Chrome Custom Tabs and shows the zedmarket.app URL bar.
 * Run after: npx bubblewrap update --manifest twa-manifest.json
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

const launcherPath = findLauncherActivity(path.join(__dirname, "app", "src", "main", "java"));

if (!launcherPath) {
  console.error("Android project not found. Run: npx bubblewrap update --manifest twa-manifest.json");
  process.exit(1);
}

let launcher = fs.readFileSync(launcherPath, "utf8");

const imports = [
  "import android.content.Intent;",
  "import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;",
  "import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity;",
];

for (const imp of imports) {
  if (!launcher.includes(imp)) {
    launcher = launcher.replace(/(package [^;]+;\s*\n)/, `$1\n${imp}\n`);
  }
}

const launchTwaMethod = `
    @Override
    protected void launchTwa() {
        LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);
        Intent intent = WebViewFallbackActivity.createLaunchIntent(this, getLaunchingUrl(), metadata);
        startActivity(intent);
        finish();
    }
`;

if (!launcher.includes("WebViewFallbackActivity.createLaunchIntent")) {
  if (!launcher.replace(/\s+$/, "").endsWith("}")) {
    console.error("Could not find class closing brace in LauncherActivity.java");
    process.exit(1);
  }
  launcher = launcher.replace(/\n}\s*$/, `\n${launchTwaMethod}\n}\n`);
}

if (!launcher.includes("WebViewFallbackActivity.createLaunchIntent")) {
  console.error("Failed to patch LauncherActivity to WebView-only.");
  process.exit(1);
}

fs.writeFileSync(launcherPath, launcher);
console.log("Forced WebView-only launcher (no Chrome URL bar):", launcherPath);
