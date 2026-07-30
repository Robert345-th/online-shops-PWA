import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const outputs = [
  { src: "assets/icon.svg", out: "icon-192.png", size: 192 },
  { src: "assets/icon.svg", out: "icon-512.png", size: 512 },
  { src: "assets/icon-maskable.svg", out: "icon-192-maskable.png", size: 192 },
  { src: "assets/icon-maskable.svg", out: "icon-512-maskable.png", size: 512 },
  { src: "assets/icon.svg", out: "assets/icon.png", size: 192 },
];

for (const { src, out, size } of outputs) {
  const input = path.join(publicDir, src);
  const output = path.join(publicDir, out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await sharp(input).resize(size, size).png().toFile(output);
  console.log(`Wrote ${out} (${size}x${size})`);
}
