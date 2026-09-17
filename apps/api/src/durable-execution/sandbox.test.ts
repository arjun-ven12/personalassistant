/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { mkdir, writeFile, mkdtemp, rm, symlink, link, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { SandboxExecutionRequestSchema } from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import {
  LocalDockerSandboxProvider,
  SandboxExecutionService,
  readSandboxOutput,
  type SandboxArtifactResolver,
} from "./sandbox.js";

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
  it("denies real execution without verified runtime disk containment", async () => {
    const read = vi.fn();
    await expect(new LocalDockerSandboxProvider({ read, write: vi.fn() }).execute(request())).rejects.toMatchObject({ reasonCode: "RUNTIME_DISK_CONTAINMENT_UNVERIFIED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("does not turn a definition requirement into a sandbox grant", async () => {
    const execute = vi.fn();
    const service = new SandboxExecutionService(
      {} as ConstructorParameters<typeof SandboxExecutionService>[0],
      { listAssignments: () => [{ id: request().assignmentId, status: "ACTIVE", agentDefinitionId: "fixture" }], findDefinition: () => ({ capabilityRequirements: ["SANDBOX_NODE_SCRIPT"] }) } as unknown as ConstructorParameters<typeof SandboxExecutionService>[1],
      { execute } as unknown as LocalDockerSandboxProvider,
    );
    await expect(service.execute(request(), { requestId: "fixture", ipAddress: "127.0.0.1" })).rejects.toMatchObject({ code: "SANDBOX_CAPABILITY_DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not assert destruction or remove mounts when the container is still present", async () => {
    let fixtureRoot = "";
    const artifacts: SandboxArtifactResolver = {
      read: vi.fn(async () => ({ name: "input.json", content: new Uint8Array() })),
      write: vi.fn(),
    };
    const runner = vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === "run") {
        const mount = args.find((value) => value.includes("target=/output"))!;
        fixtureRoot = dirname(mount.match(/source=([^,]+)/)![1]!);
      }
      return {
        exitCode: args[0] === "rm" ? 1 : 0,
        stdout: args[0] === "container" ? "synthetic-container-id" : "",
        stderr: "",
        timedOut: false,
      };
    });
    try {
      await expect(
        new LocalDockerSandboxProvider(artifacts, "/reviewed/docker", runner).execute(
          request({ expectedOutputs: [] }),
        ),
      ).rejects.toMatchObject({ code: "SANDBOX_UNAVAILABLE", destroyed: false });
      await expect(
        import("node:fs/promises").then(({ access }) => access(fixtureRoot)),
      ).resolves.toBeUndefined();
    } finally {
      if (fixtureRoot) {
        await chmod(join(fixtureRoot, "input"), 0o700);
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    }
  });
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
        if (args[0] === "rm")
          return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
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
    expect(runner).toHaveBeenLastCalledWith(
      expect.objectContaining({
        args: ["rm", "--force", expect.stringMatching(/^alexa-sandbox-/)],
      }),
    );

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

  it("rejects symlinks, hard links, directories, traversal and oversized files without reading a host target", async () => {
    const root = await mkdtemp(join(tmpdir(), "alexa-output-test-"));
    try {
      await writeFile(join(root, "fixture"), "synthetic fixture");
      await symlink(join(root, "fixture"), join(root, "symlink"));
      await link(join(root, "fixture"), join(root, "hardlink"));
      await mkdir(join(root, "directory"));
      await writeFile(join(root, "large"), "12345");
      await expect(readSandboxOutput(root, "symlink", 100)).rejects.toBeDefined();
      await expect(readSandboxOutput(root, "hardlink", 100)).rejects.toMatchObject({
        code: "POLICY_DENIED",
      });
      await expect(readSandboxOutput(root, "directory", 100)).rejects.toMatchObject({
        code: "POLICY_DENIED",
      });
      await expect(readSandboxOutput(root, "../fixture", 100)).rejects.toMatchObject({
        code: "POLICY_DENIED",
      });
      await expect(readSandboxOutput(root, "large", 4)).rejects.toMatchObject({
        code: "RESOURCE_LIMIT",
      });
      expect((await readSandboxOutput(root, "large", 5)).toString()).toBe("12345");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes the named container on timeout and never collects its outputs", async () => {
    const artifacts: SandboxArtifactResolver = {
      read: vi.fn(async () => ({ name: "input.json", content: new Uint8Array() })),
      write: vi.fn(),
    };
    const runner = vi.fn(async ({ args }: { args: string[] }) => ({
      exitCode: args[0] === "rm" ? 0 : null,
      stdout: "",
      stderr: "",
      timedOut: args[0] === "run",
    }));
    const provider = new LocalDockerSandboxProvider(
      artifacts,
      "/reviewed/docker",
      runner,
    );
    await expect(provider.execute(request())).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(artifacts.write).not.toHaveBeenCalled();
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
