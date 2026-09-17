/* eslint-disable @typescript-eslint/unbound-method */
import {
  EngineeringCommandProfileSchema,
  EngineeringCommandResultSchema,
  type EngineeringCommandDefinition,
} from "@alexa-control/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EngineeringRuntimeError,
  EngineeringRuntimeService,
  type EngineeringRuntimeProvider,
} from "./service.js";
import { InMemoryEngineeringRuntimeStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";
const agentA = "30000000-0000-4000-8000-000000000001";
const agentB = "30000000-0000-4000-8000-000000000002";

const provider = (): EngineeringRuntimeProvider => ({
  inspectRepository: vi.fn(() =>
    Promise.resolve({
      baseCommit: "a".repeat(40),
      branch: "main",
      dirty: false,
      metadata: {
        languages: ["TypeScript"],
        packageManagers: ["pnpm"],
        frameworks: [],
        importantFiles: ["package.json"],
        contractBindings: [],
      },
    }),
  ),
  createWorktree: vi.fn(() => Promise.resolve()),
  inspectWorktree: vi.fn(() =>
    Promise.resolve({
      exists: true,
      baseCommit: "a".repeat(40),
      headCommit: "a".repeat(40),
      dirty: false,
      branch: "alexa/task",
    }),
  ),
  removeWorktree: vi.fn(() => Promise.resolve()),
  search: vi.fn(() =>
    Promise.resolve([{ path: "source.ts", line: 1, preview: "value" }]),
  ),
  readFile: vi.fn(() =>
    Promise.resolve({
      path: "source.ts",
      startLine: 1,
      endLine: 1,
      content: "value",
      sha256: "b".repeat(64),
      truncated: false,
      redactions: [],
    }),
  ),
  applyPatch: vi.fn(() =>
    Promise.resolve({ path: "source.ts", sha256: "c".repeat(64) }),
  ),
  createFile: vi.fn(() =>
    Promise.resolve({ path: "created.ts", sha256: "d".repeat(64) }),
  ),
  quarantineFile: vi.fn(() =>
    Promise.resolve({ path: "source.ts", recoveryLocator: "recovery" }),
  ),
  gitStatus: vi.fn(() =>
    Promise.resolve({
      branch: "alexa/task",
      entries: [],
      dirty: false,
      truncated: false,
    }),
  ),
  gitDiff: vi.fn(() =>
    Promise.resolve({ patch: "", files: [], truncated: false, redactions: [] }),
  ),
  runCommand: vi.fn((input: { command: EngineeringCommandDefinition }) =>
    Promise.resolve(
      EngineeringCommandResultSchema.parse({
        commandId: input.command.id,
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        startedAt: "2026-09-15T00:00:00.000Z",
        completedAt: "2026-09-15T00:00:00.001Z",
        durationMs: 1,
        timedOut: false,
        cancelled: false,
        truncated: false,
        networkIsolated: true,
      }),
    ),
  ),
});

describe("EngineeringRuntimeService", () => {
  let store: InMemoryEngineeringRuntimeStore;
  let native: EngineeringRuntimeProvider;
  let service: EngineeringRuntimeService;
  let allow: boolean;
  let protectedApproval: boolean;
  const audit = vi.fn();
  const now = () => new Date("2026-09-15T00:00:00.000Z");
  const context = (
    companyId = companyA,
    agentId: string | null = agentA,
    workerId = "worker-a",
  ) => ({
    ownerId,
    companyId,
    agentId,
    requestId: crypto.randomUUID(),
    ipAddress: "127.0.0.1",
    workerId,
  });

  beforeEach(async () => {
    store = new InMemoryEngineeringRuntimeStore();
    native = provider();
    allow = true;
    protectedApproval = false;
    service = new EngineeringRuntimeService(
      store,
      {
        resolve: vi.fn((_ownerId, companyId, locatorId) =>
          Promise.resolve(
            companyId === companyA && locatorId === "repo-locator"
              ? {
                  rootPath: "/registered/repository",
                  enabled: true,
                  read: true,
                  write: true,
                }
              : undefined,
          ),
        ),
      },
      {
        authorize: vi.fn(() =>
          Promise.resolve({
            allowed: allow,
            protectedPathApproved: protectedApproval,
          }),
        ),
      },
      native,
      audit,
      now,
    );
    await service.saveGovernedCommandProfile(
      EngineeringCommandProfileSchema.parse({
        schemaVersion: "1",
        id: "node-safe",
        ownerId,
        companyId: companyA,
        displayName: "Node safe validation",
        commands: [
          {
            id: "lint",
            executable: "pnpm",
            args: ["lint"],
            kind: "LINT",
            timeoutMs: 30_000,
            maxOutputBytes: 8_192,
            networkPolicy: "DENY",
          },
          {
            id: "typecheck",
            executable: "pnpm",
            args: ["typecheck"],
            kind: "TYPECHECK",
            timeoutMs: 30_000,
            maxOutputBytes: 8_192,
            networkPolicy: "DENY",
          },
          {
            id: "test",
            executable: "pnpm",
            args: ["test"],
            kind: "TEST",
            timeoutMs: 30_000,
            maxOutputBytes: 8_192,
            networkPolicy: "DENY",
          },
          {
            id: "build",
            executable: "pnpm",
            args: ["build"],
            kind: "BUILD",
            timeoutMs: 30_000,
            maxOutputBytes: 8_192,
            networkPolicy: "DENY",
          },
        ],
        validationOrder: ["lint", "typecheck", "test", "build"],
        status: "ACTIVE",
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      }),
    );
  });

  const register = () =>
    service.registerRepository(context(), {
      displayName: "Repository",
      workspaceLocatorId: "repo-locator",
      defaultBranch: "main",
      protectedBranches: [],
      protectedPaths: ["security/**"],
      generatedPaths: ["dist/**"],
      commandProfileId: "node-safe",
      capabilityProfileId: "engineering-default",
      authorizedAgentIds: [agentA],
    });

  it("registers by governed locator and creates idempotent isolated workspace records", async () => {
    const repository = await register();
    const body = {
      repositoryId: repository.id,
      taskId: crypto.randomUUID(),
      agentId: agentA,
      idempotencyKey: "task-1",
      slug: "fix parser",
      expiresAt: null,
    };
    const first = await service.createWorkspace(context(), body);
    const retry = await service.createWorkspace(context(), body);
    expect(retry.id).toBe(first.id);
    expect(first.branchName).toMatch(/^alexa\/[a-f0-9]{12}-[a-f0-9]{6}-fix-parser$/);
    expect(first.baseCommit).toBe("a".repeat(40));
    expect(native.createWorktree).toHaveBeenCalledTimes(1);
  });

  it("denies cross-company repository and workspace identifiers", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "tenant",
      slug: "tenant",
      expiresAt: null,
    });
    await expect(
      service.createWorkspace(context(companyB), {
        repositoryId: repository.id,
        taskId: null,
        agentId: agentA,
        idempotencyKey: "foreign",
        slug: "foreign",
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ code: "REPOSITORY_NOT_FOUND" });
    await expect(
      service.gitStatus(context(companyB), workspace.id),
    ).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });

  it("denies unassigned agents and protected paths without approval", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "auth",
      slug: "auth",
      expiresAt: null,
    });
    await expect(
      service.gitStatus(context(companyA, agentB), workspace.id),
    ).rejects.toMatchObject({ code: "REPOSITORY_NOT_AUTHORIZED" });
    allow = false;
    await expect(
      service.applyPatch(context(), workspace.id, {
        path: "security/policy.ts",
        expectedSha256: "a".repeat(64),
        hunks: [{ startLine: 1, endLine: 1, replacement: "changed" }],
      }),
    ).rejects.toMatchObject({ code: "PROTECTED_PATH" });
    expect(native.applyPatch).not.toHaveBeenCalled();
    allow = true;
    protectedApproval = true;
    await service.applyPatch(
      context(),
      workspace.id,
      {
        path: "security/policy.ts",
        expectedSha256: "a".repeat(64),
        hunks: [{ startLine: 1, endLine: 1, replacement: "changed" }],
      },
      crypto.randomUUID(),
    );
    expect(native.applyPatch).toHaveBeenCalledWith(
      expect.objectContaining({ protectedPathApproved: true }),
    );
  });

  it("uses a fenced expiring durable lease and denies concurrent workspace ownership", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "lease",
      slug: "lease",
      expiresAt: null,
    });
    const lease = store.acquireWorkspaceLease({
      ownerId,
      companyId: companyA,
      workspaceId: workspace.id,
      workerId: "other-worker",
      now: now().toISOString(),
      expiresAt: "2026-09-15T00:05:00.000Z",
    });
    expect(lease?.leaseGeneration).toBe(1);
    const renewed = store.renewWorkspaceLease({
      ownerId,
      companyId: companyA,
      workspaceId: workspace.id,
      workerId: "other-worker",
      generation: lease!.leaseGeneration,
      now: now().toISOString(),
      expiresAt: "2026-09-15T00:10:00.000Z",
    });
    expect(renewed?.leaseExpiresAt).toBe("2026-09-15T00:10:00.000Z");
    expect(
      store.renewWorkspaceLease({
        ownerId,
        companyId: companyA,
        workspaceId: workspace.id,
        workerId: "wrong-worker",
        generation: lease!.leaseGeneration,
        now: now().toISOString(),
        expiresAt: "2026-09-15T00:20:00.000Z",
      }),
    ).toBeUndefined();
    await expect(
      service.readFile(context(), workspace.id, {
        path: "source.ts",
        startLine: 1,
        maxBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_BUSY" });
    expect(native.readFile).not.toHaveBeenCalled();
  });

  it("runs the configured validation order and records structured results", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "validation",
      slug: "validation",
      expiresAt: null,
    });
    const report = await service.validate(context(), workspace.id);
    expect(report.status).toBe("PASS");
    expect(report.steps.map((step) => step.kind)).toEqual([
      "LINT",
      "TYPECHECK",
      "TEST",
      "BUILD",
    ]);
    expect(native.runCommand).toHaveBeenCalledTimes(4);
  });

  it("reports bounded timeout and parsed validation failure details without running later steps", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "validation-timeout",
      slug: "validation timeout",
      expiresAt: null,
    });
    vi.mocked(native.runCommand)
      .mockResolvedValueOnce(
        EngineeringCommandResultSchema.parse({
          commandId: "lint",
          exitCode: 0,
          stdout: "",
          stderr: "",
          startedAt: now().toISOString(),
          completedAt: now().toISOString(),
          durationMs: 1,
          timedOut: false,
          cancelled: false,
          truncated: false,
          networkIsolated: true,
        }),
      )
      .mockResolvedValueOnce(
        EngineeringCommandResultSchema.parse({
          commandId: "typecheck",
          exitCode: null,
          stdout: "x".repeat(8_192),
          stderr: "source.ts:12: Type mismatch",
          startedAt: now().toISOString(),
          completedAt: now().toISOString(),
          durationMs: 30_000,
          timedOut: true,
          cancelled: false,
          truncated: true,
          networkIsolated: true,
        }),
      );
    const report = await service.validate(context(), workspace.id);
    expect(report.status).toBe("FAIL");
    expect(report.steps).toHaveLength(2);
    expect(report.steps[1]?.status).toBe("FAIL");
    expect(report.steps[1]?.result).toMatchObject({ timedOut: true, truncated: true });
    expect(
      report.steps[1]?.failures.some(
        (failure) =>
          failure.file === "source.ts" && failure.message === "Type mismatch",
      ),
    ).toBe(true);
    expect(native.runCommand).toHaveBeenCalledTimes(2);
  });

  it("reconciles durable workspace state after a runtime restart and preserves dirty cleanup", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "recovery",
      slug: "recovery",
      expiresAt: null,
    });
    vi.mocked(native.inspectWorktree).mockResolvedValue({
      exists: true,
      baseCommit: workspace.baseCommit,
      headCommit: workspace.baseCommit,
      dirty: true,
      branch: workspace.branchName,
    });
    const restarted = new EngineeringRuntimeService(
      store,
      service.locatorResolver,
      service.authorizer,
      native,
      audit,
      now,
    );
    const reconciled = await restarted.reconcile(context());
    expect(reconciled.find((item) => item.id === workspace.id)?.state).toBe("DIRTY");
    await expect(
      restarted.archiveWorkspace(context(), workspace.id),
    ).rejects.toMatchObject({ code: "WORKTREE_ERROR" });
    expect(native.removeWorktree).not.toHaveBeenCalled();
  });

  it("fails closed when the trusted provider or network-isolated command implementation is unavailable", async () => {
    const repository = await register();
    const workspace = await service.createWorkspace(context(), {
      repositoryId: repository.id,
      taskId: null,
      agentId: agentA,
      idempotencyKey: "provider",
      slug: "provider",
      expiresAt: null,
    });
    const unavailable = new EngineeringRuntimeService(
      store,
      service.locatorResolver,
      service.authorizer,
      undefined,
      audit,
      now,
    );
    await expect(unavailable.gitStatus(context(), workspace.id)).rejects.toMatchObject({
      code: "INCONSISTENT_STATE",
    });
    vi.mocked(native.runCommand).mockRejectedValueOnce(
      new EngineeringRuntimeError("COMMAND_SANDBOX_UNAVAILABLE", "No isolated runner."),
    );
    await expect(
      service.runCommand(context(), workspace.id, "test"),
    ).rejects.toMatchObject({ code: "COMMAND_SANDBOX_UNAVAILABLE" });
    await expect(
      service.runCommand(context(), workspace.id, "sudo"),
    ).rejects.toMatchObject({ code: "COMMAND_NOT_ALLOWED" });
  });
});
