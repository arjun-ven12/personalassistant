/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { mkdir, writeFile } from "node:fs/promises";

import { SandboxExecutionRequestSchema } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { LocalDockerSandboxProvider, type SandboxArtifactResolver } from "./sandbox.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000001";

const request = (overrides: Record<string, unknown> = {}) =>
  SandboxExecutionRequestSchema.parse({
    ownerId,
    companyId,
    assignmentId: "30000000-0000-4000-8000-000000000001",
    taskId: "40000000-0000-4000-8000-000000000001",
    language: "NODE",
    codeArtifactRef: "artifact:code",
    inputArtifactRefs: ["artifact:input"],
    networkPolicy: "DENY_ALL",
    networkAllowlist: [],
    resourceLimits: { cpuCores: 1, memoryMb: 128, diskMb: 16, processCount: 16 },
    timeoutMs: 1_000,
    allowedSecretRefs: [],
    expectedOutputs: ["result.json"],
    traceId: "1234567890abcdef1234567890abcdef",
    ...overrides,
  });

describe("Phase 25.6 local sandbox boundary", () => {
  it("uses fixed networkless Docker controls, opaque company artifacts, redaction, and teardown", async () => {
    const writes: Array<{ ownerId: string; companyId: string; name: string }> = [];
    const artifacts: SandboxArtifactResolver = {
      read: vi.fn(async (owner, company, ref) => ({
        name: ref === "artifact:code" ? "code.js" : "input.json",
        content: new TextEncoder().encode(
          ref === "artifact:code" ? "console.log('ok')" : "{}",
        ),
      })),
      write: vi.fn(async (owner, company, input) => {
        writes.push({ ownerId: owner, companyId: company, name: input.name });
        return `artifact:output:${input.name}`;
      }),
    };
    let outputDirectory = "";
    const runner = vi.fn(
      async ({ binary, args }: { binary: string; args: string[] }) => {
        expect(binary).toBe("/reviewed/docker");
        expect(args).toEqual(
          expect.arrayContaining([
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "65534:65534",
          ]),
        );
        expect(args.join(" ")).not.toMatch(/--privileged|--network host|docker\.sock/);
        const outputMount = args.find((value) => value.includes("target=/output"))!;
        outputDirectory = outputMount.match(/source=([^,]+)/)?.[1] ?? "";
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(`${outputDirectory}/result.json`, '{"ok":true}');
        return {
          exitCode: 0,
          stdout: "Bearer abcdefghijklmnopqrstuvwxyz",
          stderr: "api_token=super-secret-value",
          timedOut: false,
        };
      },
    );
    const provider = new LocalDockerSandboxProvider(
      artifacts,
      "/reviewed/docker",
      runner,
    );
    const result = await provider.execute(request());

    expect(result.outputArtifactRefs).toEqual(["artifact:output:result.json"]);
    expect(result.stdout).toBe("[REDACTED]");
    expect(result.stderr).toBe("[REDACTED]");
    expect(writes).toEqual([{ ownerId, companyId, name: "result.json" }]);
    expect(artifacts.read).toHaveBeenCalledWith(ownerId, companyId, "artifact:code");
    expect(artifacts.read).toHaveBeenCalledWith(ownerId, companyId, "artifact:input");
    await expect(
      import("node:fs/promises").then(({ access }) => access(outputDirectory)),
    ).rejects.toBeDefined();
  });

  it("denies network and secret injection before starting a container", async () => {
    const artifacts: SandboxArtifactResolver = {
      read: vi.fn(),
      write: vi.fn(),
    };
    const runner = vi.fn();
    const provider = new LocalDockerSandboxProvider(
      artifacts,
      "/reviewed/docker",
      runner,
    );
    await expect(
      provider.execute(request({ networkPolicy: "APPROVED_INTERNET" })),
    ).rejects.toMatchObject({ code: "NETWORK_DENIED" });
    await expect(
      provider.execute(request({ allowedSecretRefs: ["credential:stripe"] })),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(runner).not.toHaveBeenCalled();
    expect(artifacts.read).not.toHaveBeenCalled();
  });
});
