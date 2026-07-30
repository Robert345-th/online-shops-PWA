const fs = require("fs");
const path = require("path");

const candidates = [
  "app-release-signed.apk",
  "app-release-unsigned.apk",
  path.join("app", "build", "outputs", "apk", "release", "app-release.apk"),
];

const dest = path.join(__dirname, "..", "public", "zedmarket.apk");

for (const file of candidates) {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("Copied", src, "→", dest);
    process.exit(0);
  }
}

console.error("No APK found. Run: npx bubblewrap build");
process.exit(1);
