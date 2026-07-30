const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const keystore = path.join(__dirname, "android.keystore");
const pass = process.env.KEYSTORE_PASS;
const assetlinksPath = path.join(__dirname, "..", "public", ".well-known", "assetlinks.json");

if (!pass) {
  console.error("KEYSTORE_PASS is required.");
  process.exit(1);
}
if (!fs.existsSync(keystore)) {
  console.error("android.keystore not found.");
  process.exit(1);
}

const out = execSync(
  `keytool -list -v -keystore "${keystore}" -alias zedmarket -storepass "${pass}"`,
  { encoding: "utf8" }
);
const match = out.match(/SHA256:\s*([0-9A-F:]+)/i);
if (!match) {
  console.error("Could not read SHA-256 fingerprint from keystore.");
  process.exit(1);
}

const fingerprint = match[1].replace(/:/g, "").toUpperCase();
const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "app.zedmarket.twa",
      sha256_cert_fingerprints: [fingerprint],
    },
  },
];

fs.writeFileSync(assetlinksPath, `${JSON.stringify(assetlinks, null, 2)}\n`);
console.log("Updated assetlinks.json with SHA-256:", fingerprint);
