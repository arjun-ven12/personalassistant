import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverInstalledMacApplications } from "./application-discovery.js";

const testRoot = path.join(os.homedir(), "Applications");
const testBundle = path.join(testRoot, "CodexDiscoveryTest.app");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>Codex Discovery Test</string>
  <key>CFBundleIdentifier</key><string>com.example.CodexDiscoveryTest</string>
  <key>CFBundleExecutable</key><string>CodexDiscoveryTest</string>
  <key>CFBundleShortVersionString</key><string>1.2.3</string>
  <key>CFBundleVersion</key><string>123</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
</dict>
</plist>`;

describe("discoverInstalledMacApplications", () => {
  afterEach(async () => {
    await fs.rm(testBundle, { recursive: true, force: true });
  });

  it("extracts safe metadata from fixed macOS application roots", async () => {
    await fs.mkdir(path.join(testBundle, "Contents", "Resources"), {
      recursive: true,
    });
    await fs.writeFile(path.join(testBundle, "Contents", "Info.plist"), plist);
    await fs.writeFile(
      path.join(testBundle, "Contents", "Resources", "AppIcon.icns"),
      "",
    );

    const discovered = await discoverInstalledMacApplications(
      "mac_agent_manual_refresh",
      [testRoot],
    );

    const app = discovered.find(
      (record) => record.bundleIdentifier === "com.example.CodexDiscoveryTest",
    );
    expect(app).toMatchObject({
      displayName: "Codex Discovery Test",
      executableName: "CodexDiscoveryTest",
      version: "1.2.3",
      buildVersion: "123",
      isUserInstalled: true,
      source: "mac_agent_manual_refresh",
    });
    expect(app?.bundlePath).toBe(testBundle);
    expect(app?.iconPath).toBe(
      path.join(testBundle, "Contents", "Resources", "AppIcon.icns"),
    );
  });
});
