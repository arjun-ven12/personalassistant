import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertEnvironmentCompatible,
  atomicReplaceApp,
  readDeviceId,
} from "./install-local-lib.mjs";

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("local Mac Agent installer", () => {
  it("atomically replaces only the app bundle and can roll back", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mac-agent-install-"));
    const source = path.join(directory, "source.app");
    const destination = path.join(directory, "Alexa Mac Agent.app");
    await mkdir(source);
    await mkdir(destination);
    await writeFile(path.join(source, "version"), "new");
    await writeFile(path.join(destination, "version"), "old");
    const replacement = await atomicReplaceApp({ source, destination });
    expect(await readFile(path.join(destination, "version"), "utf8")).toBe("new");
    await replacement.rollback();
    expect(await readFile(path.join(destination, "version"), "utf8")).toBe("old");
  });

  it("does not allow silent environment switching", () => {
    expect(() =>
      assertEnvironmentCompatible({
        current: "production",
        next: "development",
        allowSwitch: false,
      }),
    ).toThrow("Refusing");
  });

  it("reads identity without modifying the Application Support file", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "mac-agent-state-"));
    const metadata = path.join(directory, "device-identity.json");
    await writeFile(metadata, JSON.stringify({ deviceId: "stable-device-id" }));
    expect(await readDeviceId(metadata)).toBe("stable-device-id");
    expect(JSON.parse(await readFile(metadata, "utf8"))).toEqual({
      deviceId: "stable-device-id",
    });
  });
});
