import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  APP_NAME,
  BUNDLE_ID,
  assertEnvironmentCompatible,
  atomicReplaceApp,
  chooseInstallPath,
  readAppEnvironment,
  readDeviceId,
} from "./install-local-lib.mjs";

const exec = promisify(execFile);
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const source = path.resolve("release/mac-arm64", APP_NAME);
const installPath = process.env.ALEXA_MAC_AGENT_INSTALL_PATH
  ? path.resolve(process.env.ALEXA_MAC_AGENT_INSTALL_PATH)
  : await chooseInstallPath({
      home: os.homedir(),
      exists: async (value) => existsSync(value),
    });
const metadataPath = path.join(
  os.homedir(),
  "Library/Application Support/Alexa Mac Agent/device-identity.json",
);
const operationalLogPath = path.join(
  os.homedir(),
  "Library/Logs/Alexa Mac Agent/alexa-mac-agent.jsonl",
);

const plistValue = async (appPath, key) =>
  (
    await exec("/usr/libexec/PlistBuddy", [
      "-c",
      `Print :${key}`,
      path.join(appPath, "Contents/Info.plist"),
    ])
  ).stdout.trim();

const isRunning = async () => {
  try {
    await exec("/usr/bin/pgrep", [
      "-f",
      `${installPath}/Contents/MacOS/Alexa Mac Agent`,
    ]);
    return true;
  } catch {
    return false;
  }
};

const stopExisting = async () => {
  if (!(await isRunning())) return;
  await exec("/usr/bin/pkill", [
    "-TERM",
    "-f",
    `${installPath}/Contents/MacOS/Alexa Mac Agent`,
  ]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await isRunning())) return;
    await sleep(250);
  }
  throw new Error("Installed Mac Agent did not quit cleanly within five seconds.");
};

const waitForLaunch = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isRunning()) return;
    await sleep(250);
  }
  throw new Error("Updated Mac Agent did not relaunch within ten seconds.");
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
const currentEnvironment = await readAppEnvironment(installPath);
assertEnvironmentCompatible({
  current: currentEnvironment,
  next: nextEnvironment,
  allowSwitch: process.env.ALEXA_ALLOW_ENVIRONMENT_SWITCH === "true",
});
const beforeDeviceId = await readDeviceId(metadataPath);
await stopExisting();
const replacement = await atomicReplaceApp({ source, destination: installPath });

try {
  const launchedAt = new Date().toISOString();
  spawn("/usr/bin/open", [installPath], { detached: true, stdio: "ignore" }).unref();
  await waitForLaunch();
  const packagedConfig = JSON.parse(
    await readFile(
      path.join(installPath, "Contents/Resources/mac-agent.config.json"),
      "utf8",
    ),
  );
  await waitForBackend(packagedConfig.ALEXA_API_BASE_URL);
  if (beforeDeviceId) await waitForAgentConnection(launchedAt);
  const afterDeviceId = await readDeviceId(metadataPath);
  if (beforeDeviceId && afterDeviceId !== beforeDeviceId) {
    throw new Error("Trusted device identity changed during app replacement.");
  }
  await replacement.commit();
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
  await stopExisting().catch(() => undefined);
  await replacement.rollback();
  if (replacement.backup) {
    spawn("/usr/bin/open", [installPath], { detached: true, stdio: "ignore" }).unref();
  }
  throw error;
}
