/**
 * Force WebView on every launch (skip Chrome Custom Tab).
 * Needed when Digital Asset Links verification fails on some phones (Tecno/Infinix).
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

const appJava = path.join(__dirname, "app", "src", "main", "java");
const launcherPath = findLauncherActivity(appJava);

if (!launcherPath) {
  console.error("LauncherActivity.java not found. Run: npx bubblewrap update --manifest twa-manifest.json");
  process.exit(1);
}

let src = fs.readFileSync(launcherPath, "utf8");

if (src.includes("WebViewFallbackActivity.createLaunchIntent")) {
  console.log("LauncherActivity already patched for WebView-only launch.");
  process.exit(0);
}

const imports = [
  "import android.content.Intent;",
  "import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;",
  "import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity;",
];

for (const imp of imports) {
  if (!src.includes(imp)) {
    src = src.replace(/(package [^;]+;\s*\n)/, `$1\n${imp}\n`);
  }
}

const override = `
    @Override
    protected void launchTwa() {
        if (isFinishing()) {
            return;
        }
        LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);
        Intent intent = WebViewFallbackActivity.createLaunchIntent(this, getLaunchingUrl(), metadata);
        startActivity(intent);
        finish();
    }
`;

src = src.replace(/\n}\s*$/, `\n${override}\n}\n`);
fs.writeFileSync(launcherPath, src);
console.log("Patched:", launcherPath);
console.log("App will open in full-screen WebView (no Chrome URL bar).");
