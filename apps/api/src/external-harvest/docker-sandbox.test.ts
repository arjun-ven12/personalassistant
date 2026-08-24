import { describe, expect, it } from "vitest";

import { DockerNodeTestSandbox, type SandboxProcessRunner } from "./docker-sandbox.js";

describe("DockerNodeTestSandbox", () => {
  it("uses one fixed, networkless, read-only Docker execution profile", async () => {
    const calls: Parameters<SandboxProcessRunner>[0][] = [];
    const runner: SandboxProcessRunner = (input) => {
      calls.push(input);
      return Promise.resolve({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false,
      });
    };
    const sandbox = new DockerNodeTestSandbox("/usr/local/bin/docker", runner);
    const result = await sandbox.execute({
      sourceCode: "module.exports = (value) => value + 1;",
      testCode:
        "const test = require('node:test'); test('ok', () => require('./source.cjs')(1));",
    });

    expect(result).toMatchObject({
      status: "PASSED",
      network: "disabled",
      hostWrites: false,
      cleanedUp: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.binary).toBe("/usr/local/bin/docker");
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining([
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "no-new-privileges",
        "node:22-alpine",
        "node",
        "--test",
        "/workspace/generated.test.cjs",
      ]),
    );
    expect(calls[0]?.args.some((arg) => arg.includes("external-research"))).toBe(
      false,
    );
    expect(calls[0]?.args.find((arg) => arg.startsWith("type=bind"))).toContain(
      "readonly",
    );
  });

  it("reports a timed-out job without claiming success", async () => {
    const sandbox = new DockerNodeTestSandbox(
      "/usr/local/bin/docker",
      () =>
        Promise.resolve({
          exitCode: null,
          stdout: "",
          stderr: "",
          timedOut: true,
        }),
    );
    await expect(
      sandbox.execute({ sourceCode: "module.exports = {};", testCode: "" }),
    ).resolves.toMatchObject({ status: "TIMED_OUT", hostWrites: false });
  });
});
