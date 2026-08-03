/**
 * Apply appVersionCode / appVersionName from twa-manifest.json to build.gradle after bubblewrap sync.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "twa-manifest.json");
const gradlePath = path.join(__dirname, "app", "build.gradle");

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

fs.writeFileSync(gradlePath, gradle);
console.log(`Set version to ${name} (${code}) in build.gradle`);
