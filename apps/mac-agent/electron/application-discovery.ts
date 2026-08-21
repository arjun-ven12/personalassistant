import {
  DiscoveredMacApplicationSchema,
  type DiscoveredApplicationSource,
  type DiscoveredMacApplication,
} from "@alexa-control/shared";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const fixedRoots = () => [
  "/Applications",
  "/System/Applications",
  path.join(os.homedir(), "Applications"),
];

const decodeXml = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");

const plistString = (xml: string, key: string) => {
  const expression = new RegExp(
    `<key>\\s*${key}\\s*</key>\\s*<string>([\\s\\S]*?)</string>`,
    "u",
  );
  const match = expression.exec(xml);
  return match?.[1] ? decodeXml(match[1]).trim() : null;
};

const safeString = (value: string | null, max: number) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("\0")) return null;
  return trimmed.slice(0, max);
};

const appNameFromPath = (bundlePath: string) =>
  path.basename(bundlePath).replace(/\.app$/i, "").trim();

const iconPathFor = async (bundlePath: string, iconName: string | null) => {
  const safeIconName = safeString(iconName, 180);
  if (!safeIconName || safeIconName.includes("/") || safeIconName.includes("\\"))
    return null;
  const filename = safeIconName.endsWith(".icns")
    ? safeIconName
    : `${safeIconName}.icns`;
  const candidate = path.normalize(path.join(bundlePath, "Contents", "Resources", filename));
  if (!candidate.startsWith(path.normalize(bundlePath) + path.sep)) return null;
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
};

const discoverBundle = async (
  bundlePath: string,
  root: string,
  source: DiscoveredApplicationSource,
): Promise<DiscoveredMacApplication | null> => {
  const infoPath = path.join(bundlePath, "Contents", "Info.plist");
  let xml: string;
  try {
    xml = await fs.readFile(infoPath, "utf8");
  } catch {
    return null;
  }
  if (!xml.includes("<plist")) return null;
  const bundleIdentifier = safeString(plistString(xml, "CFBundleIdentifier"), 255);
  if (!bundleIdentifier) return null;
  const displayName =
    safeString(plistString(xml, "CFBundleDisplayName"), 160) ??
    safeString(plistString(xml, "CFBundleName"), 160) ??
    appNameFromPath(bundlePath);
  const executableName = safeString(plistString(xml, "CFBundleExecutable"), 180);
  const now = new Date().toISOString();
  const parsed = DiscoveredMacApplicationSchema.safeParse({
    displayName,
    bundleIdentifier,
    bundlePath,
    executableName,
    version: safeString(plistString(xml, "CFBundleShortVersionString"), 80),
    buildVersion: safeString(plistString(xml, "CFBundleVersion"), 80),
    iconPath: await iconPathFor(bundlePath, plistString(xml, "CFBundleIconFile")),
    bundleUrl: pathToFileURL(bundlePath).toString(),
    isSystemApp: root === "/System/Applications",
    isUserInstalled: root.endsWith("/Applications") && root.startsWith(os.homedir()),
    source,
    discoveredAt: now,
  });
  return parsed.success ? parsed.data : null;
};

export const discoverInstalledMacApplications = async (
  source: DiscoveredApplicationSource,
  roots?: string[],
) => {
  if (process.platform !== "darwin" && !roots) return [];
  const scanRoots = roots ?? fixedRoots();
  const discovered: DiscoveredMacApplication[] = [];
  for (const root of scanRoots) {
    let entries: Array<{ isDirectory: () => boolean; name: string }>;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
      const bundle = await discoverBundle(path.join(root, entry.name), root, source);
      if (bundle) discovered.push(bundle);
    }
  }
  return discovered.sort((left, right) =>
    left.bundleIdentifier.localeCompare(right.bundleIdentifier),
  );
};
