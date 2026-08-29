import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const resources = path.join(root, "build-resources");
const iconset = path.join(resources, "AlexaMacAgent.iconset");
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

for (const size of [16, 32, 128, 256, 512]) {
  execFileSync("/usr/bin/sips", ["-s", "format", "png", "-z", String(size), String(size), path.join(resources, "icon.svg"), "--out", path.join(iconset, `icon_${size}x${size}.png`)]);
  execFileSync("/usr/bin/sips", ["-s", "format", "png", "-z", String(size * 2), String(size * 2), path.join(resources, "icon.svg"), "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)]);
}
execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", path.join(resources, "icon.icns")]);
execFileSync("/usr/bin/sips", ["-s", "format", "png", "-z", "36", "36", path.join(resources, "trayTemplate.svg"), "--out", path.join(resources, "trayTemplate.png")]);
rmSync(iconset, { recursive: true, force: true });
