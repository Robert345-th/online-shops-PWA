/**
 * Apply appVersionCode / appVersionName from twa-manifest.json to build.gradle after bubblewrap sync.
 * Also install ProGuard keep rules so WebView helpers survive minify.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "twa-manifest.json");
const gradlePath = path.join(__dirname, "app", "build.gradle");
const proguardSrc = path.join(__dirname, "webview-shell", "proguard-rules.pro");
const proguardDest = path.join(__dirname, "app", "proguard-rules.pro");

if (!fs.existsSync(gradlePath)) {
  console.error("build.gradle not found. Run bubblewrap update first.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const code = manifest.appVersionCode;
const name = manifest.appVersionName;

if (!code || !name) {
  console.error("twa-manifest.json must set appVersionCode and appVersionName.");
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);

if (fs.existsSync(proguardSrc)) {
  fs.copyFileSync(proguardSrc, proguardDest);
  if (!gradle.includes("proguard-rules.pro")) {
    gradle = gradle.replace(
      /buildTypes\s*\{\s*release\s*\{\s*minifyEnabled\s+true\s*\}/,
      `buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }`
    );
  }
  console.log("Installed ProGuard keep rules for WebView activities.");
}

if (!gradle.includes("play-services-location")) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    `dependencies {
    implementation 'com.google.android.gms:play-services-location:21.3.0'`
  );
  console.log("Added play-services-location for Turn on location dialog.");
}

fs.writeFileSync(gradlePath, gradle);
console.log(`Set version to ${name} (${code}) in build.gradle`);
