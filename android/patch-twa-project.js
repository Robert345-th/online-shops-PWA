/**
 * After bubblewrap update, patch the generated Android project so the window
 * background and status bar are black. This removes the thin white flash/line
 * some phones show above the app header while loading.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const STYLES_PATH = path.join(ROOT, "app", "src", "main", "res", "values", "styles.xml");
const MANIFEST_PATH = path.join(ROOT, "app", "src", "main", "AndroidManifest.xml");
const JAVA_ROOT = path.join(ROOT, "app", "src", "main", "java");

const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.ZedMarket" parent="android:Theme.NoTitleBar">
        <item name="android:windowBackground">#111111</item>
        <item name="android:statusBarColor">#111111</item>
        <item name="android:navigationBarColor">#111111</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    </style>
</resources>
`;

function patchManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn("patch-twa-project: AndroidManifest.xml not found, skipping");
    return;
  }
  let xml = fs.readFileSync(MANIFEST_PATH, "utf8");
  xml = xml.replace(
    /android:theme="@android:style\/Theme\.Translucent\.NoTitleBar"/,
    'android:theme="@style/Theme.ZedMarket"'
  );
  fs.writeFileSync(MANIFEST_PATH, xml);
  console.log("patch-twa-project: updated application theme");
}

function findLauncherActivity() {
  if (!fs.existsSync(JAVA_ROOT)) return null;
  const stack = [JAVA_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === "LauncherActivity.java") return full;
    }
  }
  return null;
}

function patchLauncherActivity() {
  const launcherPath = findLauncherActivity();
  if (!launcherPath) {
    console.warn("patch-twa-project: LauncherActivity.java not found, skipping");
    return;
  }
  let java = fs.readFileSync(launcherPath, "utf8");
  if (java.includes("setStatusBarColor")) {
    console.log("patch-twa-project: LauncherActivity already patched");
    return;
  }
  java = java.replace(
    "import android.os.Bundle;",
    "import android.graphics.Color;\nimport android.os.Bundle;"
  );
  java = java.replace(
    "super.onCreate(savedInstanceState);",
    "super.onCreate(savedInstanceState);\n        getWindow().setBackgroundDrawableResource(android.R.color.black);\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {\n            getWindow().setStatusBarColor(Color.parseColor(\"#111111\"));\n            getWindow().getDecorView().setBackgroundColor(Color.parseColor(\"#111111\"));\n        }"
  );
  fs.writeFileSync(launcherPath, java);
  console.log("patch-twa-project: patched LauncherActivity");
}

fs.mkdirSync(path.dirname(STYLES_PATH), { recursive: true });
fs.writeFileSync(STYLES_PATH, STYLES_XML);
console.log("patch-twa-project: wrote styles.xml");

patchManifest();
patchLauncherActivity();
