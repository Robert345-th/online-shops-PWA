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

const fingerprint = match[1].trim().toUpperCase();
const colonFingerprint = fingerprint.includes(":")
  ? fingerprint
  : fingerprint.match(/.{1,2}/g).join(":");

let existing = [];
if (fs.existsSync(assetlinksPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(assetlinksPath, "utf8"))[0]?.target?.sha256_cert_fingerprints || [];
  } catch {
    existing = [];
  }
}

const normalize = (fp) => fp.replace(/:/g, "").toUpperCase();
const merged = [...existing];
if (!merged.some((fp) => normalize(fp) === normalize(colonFingerprint))) {
  merged.push(colonFingerprint);
}

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "app.zedmarket.twa",
      sha256_cert_fingerprints: merged,
    },
  },
];

fs.writeFileSync(assetlinksPath, `${JSON.stringify(assetlinks, null, 2)}\n`);
console.log("Updated assetlinks.json with SHA-256:", fingerprint);
