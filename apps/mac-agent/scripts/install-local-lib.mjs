import { access, cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "Athena Mac Agent.app";
export const BUNDLE_ID = "com.alexacontrol.macagent";

export const chooseInstallPath = async ({ home = os.homedir(), exists }) => {
  const systemPath = `/Applications/${APP_NAME}`;
  if (await exists(systemPath)) return systemPath;
  return path.join(home, "Applications", APP_NAME);
};

export const readDeviceId = async (metadataPath) => {
  try {
    const parsed = JSON.parse(await readFile(metadataPath, "utf8"));
    return typeof parsed.deviceId === "string" ? parsed.deviceId : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

export const readAppEnvironment = async (appPath) => {
  const configPath = path.join(
    appPath,
    "Contents",
    "Resources",
    "mac-agent.config.json",
  );
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    return typeof parsed.ALEXA_AGENT_ENVIRONMENT === "string"
      ? parsed.ALEXA_AGENT_ENVIRONMENT
      : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

export const assertEnvironmentCompatible = ({ current, next, allowSwitch }) => {
  if (current && next && current !== next && !allowSwitch) {
    throw new Error(
      `Refusing to replace a ${current} app with a ${next} build. Set ALEXA_ALLOW_ENVIRONMENT_SWITCH=true to confirm the switch.`,
    );
  }
};

export const atomicReplaceApp = async ({ source, destination }) => {
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true, mode: 0o755 });
  await access(source, constants.R_OK);
  await access(parent, constants.W_OK);
  const suffix = `${process.pid}-${Date.now()}`;
  const stage = path.join(parent, `.${APP_NAME}.stage-${suffix}`);
  const backup = path.join(parent, `.${APP_NAME}.backup-${suffix}`);
  let hadExisting = false;
  try {
    await cp(source, stage, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    try {
      await rename(destination, backup);
      hadExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(stage, destination);
    return {
      backup: hadExisting ? backup : null,
      async commit() {
        if (hadExisting) await rm(backup, { recursive: true, force: true });
      },
      async rollback() {
        await rm(destination, { recursive: true, force: true });
        if (hadExisting) await rename(backup, destination);
      },
    };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (hadExisting) {
      await rm(destination, { recursive: true, force: true });
      await rename(backup, destination).catch(() => undefined);
    }
    throw error;
  }
};
