import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  APP_EXECUTABLE,
  BUNDLE_ID,
  LEGACY_APP_EXECUTABLE,
  assertEnvironmentCompatible,
  atomicReplaceApp,
  chooseInstallPath,
  readAppEnvironment,
  readDeviceId,
} from "./install-local-lib.mjs";

const exec = promisify(execFile);
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const localPackageName = "Alexa Mac Agent.app";
const source = path.resolve("release/mac-arm64", localPackageName);
const installPath = process.env.ALEXA_MAC_AGENT_INSTALL_PATH
  ? path.resolve(process.env.ALEXA_MAC_AGENT_INSTALL_PATH)
  : await chooseInstallPath({
      home: os.homedir(),
      exists: async (value) => existsSync(value),
    });
const legacyInstallPath = path.join(path.dirname(installPath), "Alexa Mac Agent.app");
const existingInstallPath = existsSync(installPath)
  ? installPath
  : existsSync(legacyInstallPath)
    ? legacyInstallPath
    : installPath;
const metadataPath = path.join(
  os.homedir(),
  "Library/Application Support/Alexa Mac Agent/device-identity.json",
);
const operationalLogPaths = ["Alexa Mac Agent", "Athena Mac Agent"].map((name) =>
  path.join(os.homedir(), "Library", "Logs", name, "alexa-mac-agent.jsonl"),
);

const plistValue = async (appPath, key) =>
  (
    await exec("/usr/libexec/PlistBuddy", [
      "-c",
      `Print :${key}`,
      path.join(appPath, "Contents/Info.plist"),
    ])
  ).stdout.trim();

const executableNames = [APP_EXECUTABLE, LEGACY_APP_EXECUTABLE];
const bundleProcessPatterns = [...new Set([installPath, legacyInstallPath])].map(
  (appPath) => `${appPath}/Contents/`,
);

const hasBundleProcess = async () => {
  for (const pattern of bundleProcessPatterns) {
    try {
      await exec("/usr/bin/pgrep", ["-f", pattern]);
      return true;
    } catch {
      // Continue so the canonical and legacy bundle paths are both checked.
    }
  }
  return false;
};

const isRunning = async (names = executableNames) => {
  for (const executableName of names) {
    try {
      await exec("/usr/bin/pgrep", [
        "-f",
        `${installPath}/Contents/MacOS/${executableName}`,
      ]);
      return true;
    } catch {
      // Continue so legacy and current executable names are both checked.
    }
  }
  return false;
};

const stopExisting = async () => {
  if (!(await hasBundleProcess())) return;
  for (const pattern of bundleProcessPatterns)
    await exec("/usr/bin/pkill", ["-TERM", "-f", pattern]).catch(() => undefined);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await hasBundleProcess())) {
      // Allow Electron's single-instance lock and LaunchServices registration to settle.
      await sleep(750);
      return;
    }
    await sleep(250);
  }
  for (const pattern of bundleProcessPatterns)
    await exec("/usr/bin/pkill", ["-KILL", "-f", pattern]).catch(() => undefined);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await hasBundleProcess())) {
      await sleep(750);
      return;
    }
    await sleep(250);
  }
  throw new Error("Installed Mac Agent processes survived bounded forced shutdown.");
};

const waitForLaunch = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isRunning()) return;
    await sleep(250);
  }
  throw new Error("Updated Mac Agent did not relaunch within ten seconds.");
};

const verifyInstalledBundle = async () => {
  await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", installPath]);
};

const launchBundle = async (appPath) => {
  const executableName = await plistValue(appPath, "CFBundleExecutable");
  spawn(path.join(appPath, "Contents", "MacOS", executableName), [], {
    detached: true,
    stdio: "ignore",
  }).unref();
};

const waitForBackend = async (apiBaseUrl) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The bounded retry handles transient restart and network timing.
    }
    await sleep(1_000);
  }
  throw new Error("Canonical backend health was not restored within thirty seconds.");
};

const waitForAgentConnection = async (launchedAt) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!(await isRunning())) {
      throw new Error(
        "Updated trusted Mac Agent exited before it reported ONLINE; the previous app will be restored.",
      );
    }
    for (const operationalLogPath of operationalLogPaths) {
      try {
        const entries = (await readFile(operationalLogPath, "utf8"))
          .trim()
          .split("\n")
          .slice(-100)
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          });
        if (
          entries.some(
            (entry) =>
              entry?.category === "connection" &&
              entry?.event === "CONNECTION_ONLINE" &&
              typeof entry?.at === "string" &&
              entry.at >= launchedAt,
          )
        )
          return;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    await sleep(1_000);
  }
  throw new Error(
    "Updated trusted Mac Agent did not report ONLINE within thirty seconds.",
  );
};

if (process.platform !== "darwin") throw new Error("mac-agent:install requires macOS.");
if (!existsSync(source)) throw new Error(`Packaged app not found at ${source}.`);
if ((await plistValue(source, "CFBundleIdentifier")) !== BUNDLE_ID) {
  throw new Error(
    "Packaged app bundle identifier does not match the trusted app identity.",
  );
}

const nextEnvironment = await readAppEnvironment(source);
const currentEnvironment = await readAppEnvironment(existingInstallPath);
assertEnvironmentCompatible({
  current: currentEnvironment,
  next: nextEnvironment,
  allowSwitch: process.env.ALEXA_ALLOW_ENVIRONMENT_SWITCH === "true",
});
const beforeDeviceId = await readDeviceId(metadataPath);
await stopExisting();
const legacyMigrationBackup =
  existingInstallPath === legacyInstallPath && legacyInstallPath !== installPath
    ? `${legacyInstallPath}.migration-${process.pid}-${Date.now()}`
    : null;
let legacyMoved = false;
let replacement = null;
let committed = false;

try {
  if (legacyMigrationBackup) {
    await rename(legacyInstallPath, legacyMigrationBackup);
    legacyMoved = true;
  }
  replacement = await atomicReplaceApp({ source, destination: installPath });
  const launchedAt = new Date().toISOString();
  await verifyInstalledBundle();
  await launchBundle(installPath);
  await waitForLaunch();
  const packagedConfig = JSON.parse(
    await readFile(
      path.join(installPath, "Contents/Resources/mac-agent.config.json"),
      "utf8",
    ),
  );
  await waitForBackend(packagedConfig.ALEXA_API_BASE_URL);
  if (beforeDeviceId) await waitForAgentConnection(launchedAt);
  await sleep(3_000);
  if (!(await isRunning())) {
    throw new Error(
      "Updated Mac Agent exited during post-launch stability verification.",
    );
  }
  const afterDeviceId = await readDeviceId(metadataPath);
  if (beforeDeviceId && afterDeviceId !== beforeDeviceId) {
    throw new Error("Trusted device identity changed during app replacement.");
  }
  await replacement.commit();
  committed = true;
  if (legacyMoved) await rm(legacyMigrationBackup, { recursive: true, force: true });
  console.log(
    `Installed ${await plistValue(installPath, "CFBundleShortVersionString")} at ${installPath}`,
  );
  console.log(
    beforeDeviceId
      ? `Preserved deviceId ${beforeDeviceId}`
      : "No existing device identity was modified.",
  );
  console.log("Mac Agent relaunched and canonical backend health is available.");
} catch (error) {
  if (!committed) {
    await stopExisting().catch(() => undefined);
    await replacement?.rollback().catch(() => undefined);
    if (legacyMoved) {
      await rename(legacyMigrationBackup, legacyInstallPath).catch(() => undefined);
    }
    const rollbackPath = replacement?.backup
      ? installPath
      : legacyMoved
        ? legacyInstallPath
        : existingInstallPath;
    if (existsSync(rollbackPath)) {
      await launchBundle(rollbackPath).catch(() => undefined);
    }
  }
  throw error;
}
