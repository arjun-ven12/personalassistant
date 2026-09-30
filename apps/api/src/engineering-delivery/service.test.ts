import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  EngineeringCommandProfileSchema,
  EngineeringDeliverySchema,
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
  EngineeringValidationReportSchema,
  EngineeringWorkspaceSchema,
} from "@alexa-control/shared";

import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringManagerService } from "../engineering-orchestration/service.js";
import type { EngineeringIntegrationService } from "../engineering-integration/service.js";
import type { SignedExecutionEngineeringGateway } from "../engineering-orchestration/signed-gateway.js";
import type { RegistryService } from "../governance/registry-service.js";
import type {
  ExecutiveNotificationEvent,
  ExecutiveNotificationService,
} from "../notifications/service.js";
import {
  EngineeringDeliveryError,
  EngineeringDeliveryService,
  type EngineeringDeliveryContext,
} from "./service.js";
import { InMemoryEngineeringDeliveryStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const repositoryId = "30000000-0000-4000-8000-000000000003";
const objectiveId = "40000000-0000-4000-8000-000000000004";
const taskId = "50000000-0000-4000-8000-000000000005";
const agentId = "60000000-0000-4000-8000-000000000006";
const workspaceId = "70000000-0000-4000-8000-000000000007";
const runId = "80000000-0000-4000-8000-000000000008";
const candidateId = "90000000-0000-4000-8000-000000000009";
const at = "2026-09-17T10:00:00.000Z";

const objective = EngineeringObjectiveSchema.parse({
  schemaVersion: "1",
  id: objectiveId,
  ownerId,
  companyId,
  repositoryId,
  workflowId: null,
  managerAgentId: "engineering_manager",
  title: "SaaS site",
  description: "Build a responsive SaaS landing website with pricing and FAQ.",
  acceptanceCriteria: ["Pricing is implemented."],
  constraints: [],
  protectedAreas: [],
  priority: "NORMAL",
  riskLevel: "MEDIUM",
  budget: null,
  deadlineAt: null,
  status: "READY",
  clarificationQuestion: null,
  clarification: null,
  maxParallelTasks: 3,
  maxReplans: 2,
  replanCount: 0,
  managerReasoningCount: 1,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: "0.0",
  version: 1,
  createdAt: at,
  updatedAt: at,
  completedAt: null,
});
const task = EngineeringTaskSchema.parse({
  schemaVersion: "1",
  id: taskId,
  ownerId,
  companyId,
  objectiveId,
  parentTaskId: null,
  repositoryId,
  workspaceId,
  title: "Implement frontend",
  description: "Implement the page.",
  acceptanceCriteria: ["Pricing is implemented."],
  taskType: "FRONTEND",
  requiredSkills: ["frontend"],
  requiredCapabilities: ["repository.file_create", "repository.validate"],
  dependencies: [],
  riskLevel: "MEDIUM",
  estimatedDifficulty: "LOW",
  assignedAgentId: agentId,
  assignedRole: "FRONTEND_ENGINEER",
  reviewerAgentId: null,
  agentSessionId: null,
  modelPolicy: {
    initialTier: "LUNA",
    currentTier: "LUNA",
    maxTier: "SOL",
    escalationCount: 0,
    reason: "Routine implementation starts at Luna.",
  },
  readOnly: false,
  reviewRequired: false,
  status: "READY",
  attempt: 0,
  maxAttempts: 3,
  leaseOwner: null,
  leaseExpiresAt: null,
  leaseGeneration: 0,
  lastFailureCategory: null,
  lastFailureSummary: null,
  createdAt: at,
  startedAt: null,
  completedAt: null,
  updatedAt: at,
});
const result = EngineeringTaskResultSchema.parse({
  schemaVersion: "1",
  id: "a0000000-0000-4000-8000-000000000010",
  ownerId,
  companyId,
  objectiveId,
  taskId,
  agentId,
  workspaceId,
  workspaceBaseCommit: "a".repeat(40),
  filesChanged: ["src/App.tsx"],
  diffSummary: "Added SaaS landing page.",
  validationStatus: "PASS",
  validationReportId: "b0000000-0000-4000-8000-000000000011",
  reviewStatus: "NOT_REQUIRED",
  modelProvider: "openai",
  modelName: "gpt-5.6-luna",
  modelTier: "LUNA",
  inputTokens: 1200,
  outputTokens: 800,
  costUsd: "0.012",
  attempts: 1,
  durationMs: 1200,
  status: "SUCCEEDED",
  failureCategory: null,
  warnings: [],
  completedAt: at,
});

const context = {
  ownerId,
  companyId,
  requestId: "request-27-4",
  ipAddress: "127.0.0.1",
  sessionId: "session-27-4",
  networkState: "PRIVATE_NETWORK" as const,
};

const fixture = (now: () => Date = () => new Date(at)) => {
  const store = new InMemoryEngineeringDeliveryStore();
  const runtime = new InMemoryEngineeringRuntimeStore();
  runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
    schemaVersion: "1", id: workspaceId, ownerId, companyId, repositoryId,
    taskId: objectiveId, agentId, idempotencyKey: "integration-workspace",
    branchName: "alexa/integration", worktreeLocator: `ew-${workspaceId}`,
    baseCommit: "a".repeat(40), headCommit: null, state: "READY",
    leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
    createdAt: at, updatedAt: at, expiresAt: null,
  }));
  runtime.saveRepository(
    EngineeringRepositorySchema.parse({
      schemaVersion: "1",
      id: repositoryId,
      ownerId,
      companyId,
      displayName: "SaaS site",
      workspaceLocatorId: "saas-site",
      defaultBranch: "main",
      protectedBranches: ["main"],
      protectedPaths: [],
      generatedPaths: ["dist/**"],
      commandProfileId: "saas-profile",
      capabilityProfileId: "engineering-autonomous-v1",
      authorizedAgentIds: [agentId],
      metadata: {
        languages: ["TypeScript"],
        packageManagers: ["pnpm"],
        frameworks: ["React", "Vite"],
        importantFiles: ["package.json"],
        contractBindings: [],
      },
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    }),
  );
  runtime.saveCommandProfile(
    EngineeringCommandProfileSchema.parse({
      schemaVersion: "1",
      id: "saas-profile",
      ownerId,
      companyId,
      displayName: "SaaS",
      commands: [
        {
          id: "build",
          executable: "pnpm",
          args: ["run", "build"],
          kind: "BUILD",
          timeoutMs: 60_000,
          maxOutputBytes: 4096,
          networkPolicy: "DENY",
        },
      ],
      validationOrder: ["build"],
      dependencyManager: "pnpm",
      developmentServers: [
        {
          id: "vite",
          executable: "pnpm",
          args: ["run", "dev", "--"],
          portFlag: "--port",
          hostFlag: "--host",
          healthPath: "/",
          startupTimeoutMs: 30_000,
          maxLifetimeMs: 60_000,
        },
      ],
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    }),
  );
  runtime.saveValidation(EngineeringValidationReportSchema.parse({
    id: "b0000000-0000-4000-8000-000000000011",
    workspaceId,
    status: "PASS",
    steps: [{ commandId: "build", kind: "BUILD", status: "PASS", result: null, failures: [] }],
    durationMs: 100,
    createdAt: at,
  }), ownerId, companyId);
  let complete = false;
  const view = () => ({
    objective: EngineeringObjectiveSchema.parse({
      ...objective,
      status: complete ? "COMPLETED" : "READY",
      completedAt: complete ? at : null,
    }),
    tasks: [
      EngineeringTaskSchema.parse({
        ...task,
        status: complete ? "COMPLETE" : "READY",
        completedAt: complete ? at : null,
      }),
    ],
    results: complete ? [result] : [],
    artifacts: [],
    events: [],
    readyForIntegration: complete,
  });
  const managerRunReady = vi.fn(() => {
    complete = true;
    return Promise.resolve(view());
  });
  const manager = {
    create: vi.fn(() => Promise.resolve(view())),
    runReady: managerRunReady,
    view: vi.fn(() => Promise.resolve(view())),
    pause: vi.fn(),
    resume: vi.fn(),
    recover: vi.fn(),
    cancel: vi.fn(),
    addInstruction: vi.fn(),
  } as unknown as EngineeringManagerService;
  const integrationView = {
    run: { id: runId, status: "READY", integrationWorkspaceId: workspaceId },
    candidate: { id: candidateId, status: "READY", filesChanged: ["src/App.tsx"],
      validationReportId: "b0000000-0000-4000-8000-000000000011" },
    reviews: [{ verdict: "PASS" }],
  };
  const integrationExecute = vi.fn(() => Promise.resolve(integrationView));
  const integration = {
    create: vi.fn(() => Promise.resolve(integrationView)),
    execute: integrationExecute,
    view: vi.fn(() => Promise.resolve(integrationView)),
  } as unknown as EngineeringIntegrationService;
  const gatewayInvoke = vi.fn(() =>
    Promise.resolve({
      output: {
        previewId: "c0000000-0000-4000-8000-000000000012",
        serverId: "vite",
        state: "RUNNING",
        pid: 321,
        port: 4173,
        url: "http://localhost:4173",
        healthStatus: "PASS",
        startedAt: at,
        checkedAt: at,
        expiresAt: "2026-09-17T11:00:00.000Z",
        failureSummary: null,
      },
    }),
  );
  const gateway = {
    invoke: gatewayInvoke,
  } as unknown as SignedExecutionEngineeringGateway;
  const notificationDispatch = vi.fn((input: ExecutiveNotificationEvent) => {
    void input;
    return Promise.resolve();
  });
  const notifications = {
    dispatch: notificationDispatch,
  } as unknown as ExecutiveNotificationService;
  const service = new EngineeringDeliveryService(
    store,
    runtime,
    {} as RegistryService,
    manager,
    integration,
    gateway,
    () => Promise.resolve([agentId]),
    notifications,
    vi.fn(() => Promise.resolve()),
    now,
  );
  return {
    service,
    store,
    manager,
    gateway,
    managerRunReady,
    integrationExecute,
    gatewayInvoke,
    notificationDispatch,
  };
};

describe("EngineeringDeliveryService", () => {
  it("shows the exact escalated repair conflict instead of a generic failure", async () => {
    const { service, store } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "integration-conflict-message",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: ["Integration ended in CONFLICTED."],
    }));
    const repairTaskId = crypto.randomUUID();
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, status: "CONFLICTED", repairCycles: 1, maxRepairCycles: 3,
        repairTaskIds: [repairTaskId], conflicts: [{ path: "src/main.tsx", status: "ESCALATED", taskIds: [repairTaskId] }] },
      candidate: null, reviews: [],
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "MERGE_CONFLICT", message: expect.stringContaining("src/main.tsx") as unknown });
  });

  it("retries the same conflicted integration only when a bounded repair cycle remains", async () => {
    const { service, store, manager, integrationExecute } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "conflicted-repair-retry",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: ["Integration ended in CONFLICTED."],
    }));
    const repairTaskId = crypto.randomUUID();
    const integrationView = { run: { id: runId, status: "CONFLICTED",
      objectiveId: created.delivery.objectiveId, repositoryId, repairCycles: 1,
      maxRepairCycles: 3, repairTaskIds: [repairTaskId],
      conflicts: [{ status: "ESCALATED", taskIds: [repairTaskId], path: "src/main.tsx" }] },
      candidate: null, reviews: [] } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>;
    const view = vi.spyOn(service.integration, "view").mockResolvedValue(integrationView);
    const managerResume = vi.spyOn(manager, "resume");
    await service.resume(context, created.delivery.id);
    expect(managerResume).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(integrationExecute).toHaveBeenCalledWith(
      context, runId, expect.stringMatching(/^delivery-/)));
    view.mockResolvedValue({ ...integrationView, run: { ...integrationView.run,
      repairCycles: 3 } });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: ["Integration ended in CONFLICTED."],
    }));
    await expect(service.resume(context, created.delivery.id))
      .rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("acknowledges a blocked run before its long scheduler retry finishes", async () => {
    const { service, store, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "asynchronous-blocked-retry",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({ ...created.delivery, status: "BLOCKED" }));
    vi.spyOn(manager, "resume").mockImplementation(() =>
      new Promise<Awaited<ReturnType<EngineeringManagerService["resume"]>>>(() => {}));
    const resumed = await service.resume(context, created.delivery.id);
    expect(resumed.delivery.status).toBe("IMPLEMENTING");
  });

  it("executes a bounded integration repair before publishing the existing candidate", async () => {
    const { service, store, managerRunReady } = fixture();
    const integrationExecute = vi.spyOn(service.integration, "execute").mockResolvedValueOnce({
      run: { id: runId, status: "REPAIRING", integrationWorkspaceId: workspaceId },
      candidate: null,
      reviews: [{ verdict: "CHANGES_REQUIRED" }],
    } as Awaited<ReturnType<EngineeringIntegrationService["execute"]>>);
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "integration-repair-loop",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    expect(managerRunReady).toHaveBeenCalledTimes(2);
    expect(integrationExecute).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Source workspace changes differ from the completed task result.", "INTEGRATION_EVIDENCE_MISMATCH"],
    ["Signed engineering execution timed out.", "DEVICE_OFFLINE"],
    ["Governed dependency preparation failed. Check the package lockfile and reviewed dependency container before retrying.", "DEPENDENCY_PREPARATION_FAILED"],
  ])("retries a completed objective after recoverable integration failure: %s", async (warning, category) => {
    const { service, store, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "integration-evidence-retry",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery,
      status: "FAILED",
      integrationRunId: null,
      warnings: [warning],
    }));
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker?.category).toBe(category);
    const managerResume = vi.spyOn(manager, "resume");
    const executeCompletedTasks = vi.spyOn(manager, "runReady");
    const resumed = await service.resume(context, created.delivery.id);
    expect(resumed.delivery.id).toBe(created.delivery.id);
    expect(managerResume).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    expect(store.find(ownerId, companyId, created.delivery.id)?.warnings).not.toContain(warning);
    expect(executeCompletedTasks).not.toHaveBeenCalled();
  });

  it("removes a resolved signed-agent timeout from a completed read model", async () => {
    const { service, store } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "resolved-timeout-warning",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    const completed = store.find(ownerId, companyId, created.delivery.id)!;
    expect(completed.candidateId).toBeTruthy();
    expect(completed.preview?.healthStatus).toBe("PASS");
    store.save(EngineeringDeliverySchema.parse({
      ...completed,
      warnings: [...completed.warnings, "Signed engineering execution timed out."],
    }));
    const read = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(read.delivery.warnings).not.toContain("Signed engineering execution timed out.");
    expect(store.find(ownerId, companyId, created.delivery.id)?.warnings).not.toContain("Signed engineering execution timed out.");
  });

  it.each([
    ["The company, repository, workspace, agent, or capability scope is invalid.", "INTEGRATION_SCOPE_MISMATCH"],
    ["No independent repository-authorized reviewer is available.", "REVIEWER_UNAVAILABLE"],
  ])("retries a failed integration with its original scoped run: %s", async (warning, category) => {
    const { service, store, manager, integrationExecute } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "integration-scope-retry",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: [warning],
    }));
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, status: "FAILED", objectiveId: created.delivery.objectiveId, repositoryId },
      candidate: null,
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker?.category).toBe(category);
    const managerResume = vi.spyOn(manager, "resume");
    const resumed = await service.resume(context, created.delivery.id);
    expect(resumed.delivery.id).toBe(created.delivery.id);
    expect(managerResume).not.toHaveBeenCalled();
    expect(integrationExecute).toHaveBeenCalledWith(
      context, runId, expect.stringMatching(/^delivery-/),
    );
  });

  it("offers governed recovery only for an expired active task lease", async () => {
    const { service, store, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "expired-lease-recovery",
    });
    const stalled = EngineeringDeliverySchema.parse({
      ...created.delivery, status: "IMPLEMENTING",
    });
    store.save(stalled);
    const currentView = await manager.view(ownerId, companyId, objectiveId);
    vi.spyOn(manager, "view").mockResolvedValue({
      ...currentView,
      objective: { ...currentView.objective, status: "RUNNING" },
      tasks: [EngineeringTaskSchema.parse({
        ...task, status: "ACTIVE", leaseOwner: "crashed-worker",
        leaseExpiresAt: "2026-09-17T09:59:59.000Z", leaseGeneration: 1,
      })],
    });
    const recover = vi.fn(() => new Promise<Awaited<ReturnType<EngineeringManagerService["recover"]>>>(() => {}));
    vi.spyOn(manager, "recover").mockImplementation(recover);
    expect((await service.controlCenter(ownerId, companyId, stalled.id)).recoveryAvailable).toBe(true);
    await service.recover(context, stalled.id);
    expect(recover).toHaveBeenCalledWith(context, objectiveId);
    await expect(service.recover({ ...context, companyId: crypto.randomUUID() }, stalled.id))
      .rejects.toMatchObject({ code: "DELIVERY_NOT_FOUND" });
  });
  it("turns an expired implementation lease into an actionable block and retries the same run", async () => {
    const { service, store, manager } = fixture();
    vi.spyOn(manager, "runReady").mockImplementation(() => new Promise<Awaited<ReturnType<EngineeringManagerService["runReady"]>>>(() => {}));
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "expired-startup-reconciliation",
    });
    const stalled = EngineeringDeliverySchema.parse({
      ...created.delivery, status: "IMPLEMENTING", updatedAt: "2026-09-17T09:55:00.000Z",
    });
    store.save(stalled);
    const currentView = await manager.view(ownerId, companyId, objectiveId);
    vi.spyOn(manager, "view").mockResolvedValue({
      ...currentView,
      objective: { ...currentView.objective, status: "RUNNING" },
      tasks: [EngineeringTaskSchema.parse({
        ...task, status: "ACTIVE", leaseOwner: "crashed-worker",
        leaseExpiresAt: "2026-09-17T09:59:59.000Z", leaseGeneration: 1,
      })],
    });
    const recover = vi.fn(() => new Promise<Awaited<ReturnType<EngineeringManagerService["recover"]>>>(() => {}));
    vi.spyOn(manager, "recover").mockImplementation(recover);
    expect(await service.reconcileStalledImplementations()).toBe(1);
    expect(await service.reconcileStalledImplementations()).toBe(0);
    const blocked = await service.controlCenter(ownerId, companyId, stalled.id);
    expect(blocked.delivery.status).toBe("BLOCKED");
    expect(blocked.blocker).toMatchObject({ category: "WORKER_CRASHED" });
    expect(blocked.activeAgents).toEqual([]);
    expect(blocked.delivery.features.every((feature) => feature.status !== "IMPLEMENTING")).toBe(true);
    expect(blocked.recoveryAvailable).toBe(true);
    await service.resume(context, stalled.id);
    expect(recover).toHaveBeenCalledExactlyOnceWith(context, objectiveId);
  });
  it("recovers an expired repair worker while the delivery is integrating", async () => {
    const { service, store, manager } = fixture();
    vi.spyOn(manager, "runReady").mockImplementation(() => new Promise<Awaited<ReturnType<EngineeringManagerService["runReady"]>>>(() => {}));
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "expired-repair-reconciliation",
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "INTEGRATING", integrationRunId: runId,
      updatedAt: "2026-09-17T09:55:00.000Z",
    }));
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, objectiveId, repositoryId, status: "REPAIRING", leaseExpiresAt: null },
      candidate: null, reviews: [],
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const current = await manager.view(ownerId, companyId, objectiveId);
    const view = vi.spyOn(manager, "view").mockResolvedValue({
      ...current, objective: { ...current.objective, status: "RUNNING" },
      tasks: [EngineeringTaskSchema.parse({ ...task, status: "ACTIVE",
        leaseOwner: "repair-worker", leaseGeneration: 2, leaseExpiresAt: "2026-09-17T10:01:00.000Z" })],
    });
    expect(await service.reconcileStalledImplementations()).toBe(0);
    vi.spyOn(service, "now").mockReturnValue(new Date("2026-09-17T10:02:00.000Z"));
    const recover = vi.spyOn(manager, "recover").mockImplementation(() => new Promise<Awaited<ReturnType<EngineeringManagerService["recover"]>>>(() => {}));
    expect(await service.reconcileStalledImplementations()).toBe(1);
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "WORKER_CRASHED" });
    await service.resume(context, created.delivery.id);
    expect(recover).toHaveBeenCalledExactlyOnceWith(context, objectiveId);
    view.mockRestore();
  });
  it("does not turn a focused existing-project label edit into a responsive redesign", async () => {
    const { service, manager } = fixture();
    vi.spyOn(manager, "runReady").mockImplementation(() => new Promise<Awaited<ReturnType<EngineeringManagerService["runReady"]>>>(() => {}));
    const created = await service.create(context, {
      request: "Change only the Settings toggle label from Compact layout to Compact view; preserve all other page content.",
      repositoryId, developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "focused-existing-label-criteria",
    });
    const objective = (await manager.view(ownerId, companyId, created.delivery.objectiveId)).objective;
    expect(objective.acceptanceCriteria).not.toContain("The interface is responsive and preserves basic accessibility.");
  });
  it("fences stale integration and retries its existing run without repeating completed tasks", async () => {
    const { service, store, managerRunReady, integrationExecute } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "stalled-integration-recovery",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toMatch(/DONE/));
    const completed = store.find(ownerId, companyId, created.delivery.id)!;
    store.save(EngineeringDeliverySchema.parse({
      ...completed, status: "INTEGRATING", candidateId: null,
      updatedAt: "2026-09-17T09:55:00.000Z",
    }));
    const integration = service.integration;
    vi.spyOn(integration, "view").mockResolvedValue({
      run: {
        id: runId, objectiveId, repositoryId, status: "INTEGRATING",
        leaseExpiresAt: "2026-09-17T09:59:59.000Z",
        integrationWorkspaceId: workspaceId,
      }, candidate: null, reviews: [],
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const before = managerRunReady.mock.calls.length;
    const executions = integrationExecute.mock.calls.length;
    expect(await service.reconcileStalledImplementations()).toBe(1);
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker).toMatchObject({ category: "WORKER_CRASHED" });
    await service.resume(context, created.delivery.id);
    await vi.waitFor(() => expect(integrationExecute.mock.calls.length).toBe(executions + 1));
    expect(managerRunReady).toHaveBeenCalledTimes(before);
  });
  it("retains the preview identifier across a stalled preview Retry", async () => {
    const { service, store, managerRunReady, integrationExecute, gatewayInvoke } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "stalled-preview-recovery",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toMatch(/DONE/));
    const completed = store.find(ownerId, companyId, created.delivery.id)!;
    const previewId = completed.preview!.previewId;
    store.save(EngineeringDeliverySchema.parse({
      ...completed, status: "PREVIEWING",
      preview: { ...completed.preview, state: "STARTING", healthStatus: "PENDING" },
      updatedAt: "2026-09-17T09:55:00.000Z",
    }));
    const integrationView = await service.integration.view(ownerId, companyId, runId);
    vi.spyOn(service.integration, "view").mockResolvedValue({
      ...integrationView,
      run: { ...integrationView.run, objectiveId, repositoryId },
    });
    const tasksBefore = managerRunReady.mock.calls.length;
    const integrationsBefore = integrationExecute.mock.calls.length;
    const previewsBefore = gatewayInvoke.mock.calls.length;
    expect(await service.reconcileStalledImplementations()).toBe(1);
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "WORKER_CRASHED" });
    await service.resume(context, created.delivery.id);
    await vi.waitFor(() => expect(gatewayInvoke.mock.calls.length).toBe(previewsBefore + 1));
    expect(gatewayInvoke).toHaveBeenLastCalledWith(expect.objectContaining({
      capability: "repository.dev_server_start",
      operationInput: expect.objectContaining({ previewId }) as unknown,
    }));
    expect(managerRunReady).toHaveBeenCalledTimes(tasksBefore);
    expect(integrationExecute).toHaveBeenCalledTimes(integrationsBefore);
  });
  it("shows the model failure even when a dependent blocked task appears first", async () => {
    const { service, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "blocked-provider-test",
    });
    const view = await manager.view(ownerId, companyId, objectiveId);
    vi.spyOn(manager, "view").mockResolvedValue({
      ...view,
      objective: { ...view.objective, status: "BLOCKED" },
      tasks: [
        { ...task, status: "BLOCKED", lastFailureCategory: "DEPENDENCY_NOT_READY" },
        { ...task, id: crypto.randomUUID(), status: "FAILED", lastFailureCategory: "MODEL_FAILURE", lastFailureSummary: "OpenAI structured output failed local schema validation." },
      ],
      readyForIntegration: false,
    });
    const current = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(current.blocker).toMatchObject({
      category: "MODEL_PROVIDER_UNAVAILABLE",
      message: "OpenAI structured output failed local schema validation.",
    });
  });
  it("identifies an AI budget denial without mislabeling it as a provider outage", async () => {
    const { service, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "budget-blocker-test",
    });
    const view = await manager.view(ownerId, companyId, objectiveId);
    vi.spyOn(manager, "view").mockResolvedValue({
      ...view,
      objective: { ...view.objective, status: "BLOCKED" },
      tasks: [{
        ...task, status: "FAILED", lastFailureCategory: "MODEL_FAILURE",
        lastFailureSummary: "Budget policy 7753cac4-3337-43f6-8049-13542bbe5607 would be exceeded.",
      }],
      readyForIntegration: false,
    });
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "BUDGET_EXCEEDED", message: "The configured AI budget would be exceeded by the next model call." });
  });
  it("shows dependency preparation failures instead of reporting a trusted device offline", async () => {
    const { service, manager } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "dependency-blocker-test",
    });
    const view = await manager.view(ownerId, companyId, objectiveId);
    vi.spyOn(manager, "view").mockResolvedValue({
      ...view,
      objective: { ...view.objective, status: "BLOCKED" },
      tasks: [{
        ...task, status: "FAILED", lastFailureCategory: "ENVIRONMENT_FAILURE",
        lastFailureSummary: "The dependency container exited unexpectedly. Check Docker Desktop resources, then retry this same run.",
      }],
      readyForIntegration: false,
    });
    const current = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(current.blocker).toMatchObject({
      category: "DEPENDENCY_PREPARATION_FAILED",
      message: "The dependency container exited unexpectedly. Check Docker Desktop resources, then retry this same run.",
    });
  });
  it("shows the independent review's concrete blocker when review execution fails", async () => {
    const { service, store } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "review-failure-detail-test",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: ["Independent integration review requires changes."],
    }));
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, status: "FAILED", conflicts: [] },
      candidate: null,
      reviews: [{ verdict: "BLOCK", findings: ["OpenAI request timed out."], createdAt: "2026-09-24T10:00:00.000Z" }],
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker).toMatchObject({
      category: "MODEL_PROVIDER_UNAVAILABLE",
      message: "OpenAI request timed out.",
    });
  });
  it.each([
    ["The reviewed integration head changed before applying its scoped repair.", "INTEGRATION_REPAIR_PENDING"],
    ["Prepared task files differ from the validated task result.", "INTEGRATION_EVIDENCE_MISMATCH"],
  ])("offers a scoped Retry for integration recovery: %s", async (warning, category) => {
    const { service, store } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "repair-replay-blocker-test",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "FAILED", integrationRunId: runId,
      warnings: [warning],
    }));
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, status: "FAILED", objectiveId: created.delivery.objectiveId, repositoryId },
      candidate: null,
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker).toMatchObject({
      category,
    });
    const executeTask = vi.spyOn(service.manager, "runReady");
    await service.resume(context, created.delivery.id);
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    expect(executeTask).not.toHaveBeenCalled();
  });
  it("surfaces the independent finding after the bounded repair limit", async () => {
    const { service, store } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "review-cap-blocker-test",
    });
    await vi.waitFor(() => {
      expect(["DONE", "DONE_WITH_WARNINGS"]).toContain(store.find(ownerId, companyId, created.delivery.id)?.status);
    });
    store.save(EngineeringDeliverySchema.parse({
      ...created.delivery, status: "BLOCKED", integrationRunId: runId,
      warnings: ["Integration ended in BLOCKED."],
    }));
    vi.spyOn(service.integration, "view").mockResolvedValue({
      run: { id: runId, status: "BLOCKED", conflicts: [], repairCycles: 3, maxRepairCycles: 3 },
      candidate: null,
      reviews: [{ verdict: "CHANGES_REQUIRED", findings: ["Configured tests did not run."],
        createdAt: "2026-09-24T10:00:00.000Z" }],
    } as unknown as Awaited<ReturnType<EngineeringIntegrationService["view"]>>);
    const blocked = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(blocked.blocker).toMatchObject({
      category: "REVIEW_CHANGES_REQUIRED",
      message: "Configured tests did not run.",
    });
  });
  it("lists registered company projects before their first delivery", async () => {
    const { service } = fixture();
    const projects = await service.projects(ownerId, companyId);
    expect(projects).toEqual([
      expect.objectContaining({
        repositoryId,
        companyId,
        repositoryName: "SaaS site",
        projectName: "SaaS site",
        stack: ["React", "Vite", "TypeScript"],
        defaultBranch: "main",
        repositoryStatus: "ACTIVE",
        latestDeliveryId: null,
        status: null,
      }),
    ]);
    expect(await service.projects(ownerId, crypto.randomUUID())).toEqual([]);
  });

  it("maps governed delivery failures to actionable non-500 statuses", () => {
    expect(new EngineeringDeliveryError("DELIVERY_NOT_FOUND", "missing")).toMatchObject(
      { statusCode: 404 },
    );
    expect(
      new EngineeringDeliveryError("DEVELOPMENT_ROOT_DENIED", "denied"),
    ).toMatchObject({ statusCode: 403 });
    expect(new EngineeringDeliveryError("INVALID_STATE", "conflict")).toMatchObject({
      statusCode: 409,
    });
    expect(
      new EngineeringDeliveryError("IDEMPOTENCY_CONFLICT", "conflict"),
    ).toMatchObject({ statusCode: 409 });
  });

  it("reuses an initializing repository when an approved new-project request is retried", async () => {
    const runtime = new InMemoryEngineeringRuntimeStore();
    const projectName = "Trial 1";
    const projectSlug = "trial-1";
    const derivedWorkspaceId = `eng-${createHash("sha256")
      .update(`${companyId}:${projectSlug}`)
      .digest("hex")
      .slice(0, 24)}`;
    const initializingRepositoryId = crypto.randomUUID();
    const profileId = "delivery-approved-retry";
    runtime.saveCommandProfile(
      EngineeringCommandProfileSchema.parse({
        schemaVersion: "1",
        id: profileId,
        ownerId,
        companyId,
        displayName: "Trial 1 autonomous delivery",
        commands: [
          {
            id: "build",
            executable: "pnpm",
            args: ["run", "build"],
            kind: "BUILD",
            timeoutMs: 60_000,
            maxOutputBytes: 4096,
            networkPolicy: "DENY",
          },
        ],
        validationOrder: ["build"],
        dependencyManager: "pnpm",
        developmentServers: [
          {
            id: "vite",
            executable: "pnpm",
            args: ["run", "dev", "--"],
            portFlag: "--port",
            hostFlag: "--host",
            healthPath: "/",
            startupTimeoutMs: 30_000,
            maxLifetimeMs: 60_000,
          },
        ],
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
    runtime.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: initializingRepositoryId,
        ownerId,
        companyId,
        displayName: projectName,
        workspaceLocatorId: derivedWorkspaceId,
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [".git", ".env", ".env.*"],
        generatedPaths: ["dist/**"],
        commandProfileId: profileId,
        capabilityProfileId: "engineering-autonomous-v1",
        authorizedAgentIds: [agentId],
        metadata: {
          languages: [],
          packageManagers: [],
          frameworks: [],
          importantFiles: [],
          contractBindings: [],
        },
        status: "INITIALIZING",
        createdAt: at,
        updatedAt: at,
      }),
    );
    const root = {
      id: "engineering-projects",
      ownerId,
      displayName: "Engineering Projects",
      rootPath: "/Users/test/engineering-projects",
      enabled: true,
      permissions: {
        read: true,
        write: true,
        createFile: true,
        modifyFile: true,
        moveFile: false,
        deleteFile: false as const,
        runScripts: true,
      },
      blockedPatterns: [".env", "external-research/"],
      allowedScripts: [],
      gitPermissions: {
        status: true,
        diff: true,
        createBranch: true,
        commit: true,
        push: false,
      },
      createdAt: at,
      updatedAt: at,
    };
    const createWorkspace = vi.fn();
    const registry = {
      getWorkspace: vi.fn(() => Promise.resolve(root)),
      listWorkspaces: vi.fn(() =>
        Promise.resolve([
          root,
          {
            ...root,
            id: derivedWorkspaceId,
            rootPath: `${root.rootPath}/${projectSlug}`,
          },
        ]),
      ),
      createWorkspace,
    } as unknown as RegistryService;
    const initializeProject = vi.fn(() =>
      Promise.resolve({
        output: {
          branch: "main",
          dirty: false,
          metadata: {
            languages: ["TypeScript"],
            packageManagers: ["pnpm"],
            frameworks: ["React", "Vite"],
            importantFiles: ["package.json"],
            contractBindings: [],
          },
        },
      }),
    );
    const service = new EngineeringDeliveryService(
      new InMemoryEngineeringDeliveryStore(),
      runtime,
      registry,
      {} as EngineeringManagerService,
      {} as EngineeringIntegrationService,
      { initializeProject } as unknown as SignedExecutionEngineeringGateway,
      () => Promise.resolve([agentId]),
      {} as ExecutiveNotificationService,
      vi.fn(() => Promise.resolve()),
      () => new Date(at),
    );

    const resumed = await (
      service as unknown as {
        initializeRepository: (
          context: EngineeringDeliveryContext,
          rootId: string,
          name: string,
          stack: string[],
        ) => Promise<{ id: string; status: string }>;
      }
    ).initializeRepository(context, root.id, projectName, ["React", "Vite"]);

    expect(resumed).toMatchObject({
      id: initializingRepositoryId,
      status: "ACTIVE",
    });
    expect(runtime.listRepositories(ownerId, companyId)).toHaveLength(1);
    expect(initializeProject).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: initializingRepositoryId,
        projectSlug,
        template: "REACT_VITE_TYPESCRIPT",
      }),
    );
    expect(createWorkspace).not.toHaveBeenCalled();

    const fresh = await (
      service as unknown as {
        initializeRepository: (
          context: EngineeringDeliveryContext,
          rootId: string,
          name: string,
          stack: string[],
        ) => Promise<{ id: string; commandProfileId: string }>;
      }
    ).initializeRepository(context, root.id, "Fresh Site", ["React", "Vite"]);
    const freshProfile = runtime.findCommandProfile(ownerId, companyId, fresh.commandProfileId);
    expect(freshProfile?.validationOrder).toEqual(["lint", "typecheck", "test", "build"]);
    expect(freshProfile?.commands.find((command) => command.id === "test")).toMatchObject({
      kind: "TEST",
      args: ["run", "test"],
      networkPolicy: "DENY",
    });
    expect(createWorkspace).toHaveBeenCalledOnce();
  });

  it("takes an existing natural-language objective through Luna work, integration, review, and healthy preview", async () => {
    const {
      service,
      managerRunReady,
      integrationExecute,
      gatewayInvoke,
      notificationDispatch,
    } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website with pricing and FAQ.",
      repositoryId,
      developmentRootWorkspaceId: null,
      projectName: "SaaS site",
      acceptanceCriteria: [],
      constraints: [],
      deadlineAt: null,
      visibleMode: false,
      idempotencyKey: "delivery-request-1",
    });
    let current = created;
    for (
      let index = 0;
      index < 20 &&
      !["DONE", "DONE_WITH_WARNINGS", "FAILED"].includes(current.delivery.status);
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      current = await service.controlCenter(ownerId, companyId, created.delivery.id);
    }
    expect(current.delivery.status).toBe("DONE");
    expect(current.delivery.preview?.url).toBe("http://localhost:4173");
    expect(current.delivery.validation).toMatchObject({
      lint: "NOT_CONFIGURED",
      typecheck: "NOT_CONFIGURED",
      tests: "NOT_CONFIGURED",
      build: "PASS",
      review: "PASS",
    });
    expect(
      current.delivery.modelUsage.find((usage) => usage.tier === "LUNA")?.calls,
    ).toBe(1);
    expect(current.delivery.filesChanged).toEqual(["src/App.tsx"]);
    expect(managerRunReady).toHaveBeenCalledOnce();
    expect(integrationExecute).toHaveBeenCalledOnce();
    expect(gatewayInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "repository.dev_server_start" }),
    );
    expect(notificationDispatch).toHaveBeenCalledOnce();
    expect(notificationDispatch.mock.calls[0]?.[0].title).toContain("validation PASS");
  });

  it("stops the elapsed clock at completion rather than growing after a refresh", async () => {
    let currentTime = new Date(at);
    const { service, store } = fixture(() => currentTime);
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "elapsed-terminal-clock",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("DONE"));
    const first = await service.controlCenter(ownerId, companyId, created.delivery.id);
    currentTime = new Date("2026-09-20T10:00:00.000Z");
    const refreshed = await service.controlCenter(ownerId, companyId, created.delivery.id);
    expect(refreshed.elapsedMs).toBe(first.elapsedMs);
  });

  it("does not publish a late preview result after the owner cancels", async () => {
    const { service, store, gatewayInvoke } = fixture();
    let releasePreview!: () => void;
    const held = new Promise<void>((resolve) => { releasePreview = resolve; });
    gatewayInvoke.mockImplementationOnce(async () => {
      await held;
      return { output: {
        previewId: "c0000000-0000-4000-8000-000000000012",
        serverId: "vite", state: "RUNNING", pid: 321, port: 4173,
        url: "http://localhost:4173", healthStatus: "PASS",
        startedAt: at, checkedAt: at, expiresAt: "2026-09-17T11:00:00.000Z",
        failureSummary: null,
      } };
    });
    gatewayInvoke.mockResolvedValueOnce({ output: {
      previewId: "c0000000-0000-4000-8000-000000000012",
      serverId: "vite", state: "STOPPED", pid: 321, port: 4173,
      url: "http://localhost:4173", healthStatus: "FAIL",
      startedAt: at, checkedAt: at, expiresAt: "2026-09-17T11:00:00.000Z",
      failureSummary: null,
    } });
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "late-preview-cancellation",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("PREVIEWING"));
    await service.cancel(context, created.delivery.id);
    releasePreview();
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("CANCELLED"));
    expect(store.find(ownerId, companyId, created.delivery.id)?.preview?.state).toBe("STOPPED");
  });

  it("retries preview startup from the same reviewed candidate without rerunning integration", async () => {
    const { service, store, integrationExecute, gatewayInvoke } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "preview-recovery",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("DONE"));
    const completed = store.find(ownerId, companyId, created.delivery.id)!;
    store.save(EngineeringDeliverySchema.parse({
      ...completed,
      status: "FAILED",
      preview: null,
      warnings: ["inconsistent types deduced for parameter $3"],
    }));
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "PREVIEW_FAILED" });
    integrationExecute.mockClear();
    gatewayInvoke.mockClear();

    await service.resume(context, created.delivery.id);
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("DONE"));
    expect(integrationExecute).not.toHaveBeenCalled();
    expect(gatewayInvoke).toHaveBeenCalledTimes(1);
    expect(store.find(ownerId, companyId, created.delivery.id)?.candidateId).toBe(candidateId);
  });

  it("keeps a failed preview retryable instead of treating missing health as completion", async () => {
    const { service, store, gatewayInvoke, integrationExecute } = fixture();
    const healthy = await gatewayInvoke.getMockImplementation()!();
    gatewayInvoke.mockResolvedValueOnce({
      output: { ...healthy.output, state: "FAILED", healthStatus: "FAIL" },
    });
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website.", repositoryId,
      developmentRootWorkspaceId: null, projectName: "SaaS site",
      acceptanceCriteria: [], constraints: [], deadlineAt: null,
      visibleMode: false, idempotencyKey: "preview-health-recovery",
    });
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("FAILED"));
    expect((await service.controlCenter(ownerId, companyId, created.delivery.id)).blocker)
      .toMatchObject({ category: "PREVIEW_FAILED" });
    integrationExecute.mockClear();

    await service.resume(context, created.delivery.id);
    await vi.waitFor(() => expect(store.find(ownerId, companyId, created.delivery.id)?.status).toBe("DONE"));
    expect(integrationExecute).not.toHaveBeenCalled();
  });

  it("denies cross-company delivery reads and preserves request idempotency", async () => {
    const { service } = fixture();
    const first = await service.create(context, {
      request: "Build a responsive SaaS landing website with pricing and FAQ.",
      repositoryId,
      developmentRootWorkspaceId: null,
      projectName: "SaaS site",
      acceptanceCriteria: [],
      constraints: [],
      deadlineAt: null,
      visibleMode: false,
      idempotencyKey: "delivery-request-2",
    });
    const retry = await service.create(context, {
      request: "Build a responsive SaaS landing website with pricing and FAQ.",
      repositoryId,
      developmentRootWorkspaceId: null,
      projectName: "SaaS site",
      acceptanceCriteria: [],
      constraints: [],
      deadlineAt: null,
      visibleMode: false,
      idempotencyKey: "delivery-request-2",
    });
    expect(retry.delivery.id).toBe(first.delivery.id);
    await expect(
      service.controlCenter(
        ownerId,
        "20000000-0000-4000-8000-000000000099",
        first.delivery.id,
      ),
    ).rejects.toMatchObject({ code: "DELIVERY_NOT_FOUND" });
  });

  it("routes preview status, restart, and stop through the signed scoped gateway", async () => {
    const { service, gatewayInvoke } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website with pricing and FAQ.",
      repositoryId,
      developmentRootWorkspaceId: null,
      projectName: "SaaS site",
      acceptanceCriteria: [],
      constraints: [],
      deadlineAt: null,
      visibleMode: false,
      idempotencyKey: "delivery-preview-control",
    });
    let current = created;
    for (
      let index = 0;
      index < 20 &&
      !["DONE", "DONE_WITH_WARNINGS", "FAILED"].includes(current.delivery.status);
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      current = await service.controlCenter(ownerId, companyId, created.delivery.id);
    }

    await service.previewControl(context, created.delivery.id, "status");
    await service.previewControl(context, created.delivery.id, "restart");
    await service.previewControl(context, created.delivery.id, "stop");

    expect(gatewayInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "repository.dev_server_status" }),
    );
    expect(gatewayInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "repository.dev_server_restart" }),
    );
    expect(gatewayInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "repository.dev_server_stop" }),
    );
  });

  it("preserves preview server identity after an agent relaunch and repairs an older unknown identity", async () => {
    const { service, store, gatewayInvoke } = fixture();
    const created = await service.create(context, {
      request: "Build a responsive SaaS landing website with pricing and FAQ.",
      repositoryId,
      developmentRootWorkspaceId: null,
      projectName: "SaaS site",
      acceptanceCriteria: [],
      constraints: [],
      deadlineAt: null,
      visibleMode: false,
      idempotencyKey: "delivery-preview-agent-relaunch",
    });
    await vi.waitFor(() => {
      expect(store.find(ownerId, companyId, created.delivery.id)?.preview?.serverId).toBe("vite");
    });
    const originalPreview = store.find(ownerId, companyId, created.delivery.id)!.preview!;
    gatewayInvoke.mockResolvedValueOnce({
      output: { ...originalPreview, state: "STOPPED", serverId: "unknown", healthStatus: "FAIL" },
    } as unknown as Awaited<ReturnType<typeof gatewayInvoke>>);
    const stopped = await service.previewControl(context, created.delivery.id, "stop");
    expect(stopped.delivery.preview?.serverId).toBe("vite");

    store.save(EngineeringDeliverySchema.parse({
      ...stopped.delivery,
      preview: { ...stopped.delivery.preview!, serverId: "unknown" },
    }));
    gatewayInvoke.mockResolvedValueOnce({
      output: { ...originalPreview, state: "RUNNING", healthStatus: "PASS" },
    } as unknown as Awaited<ReturnType<typeof gatewayInvoke>>);
    const restarted = await service.previewControl(context, created.delivery.id, "restart");
    expect(restarted.delivery.preview?.serverId).toBe("vite");
    expect(gatewayInvoke).toHaveBeenLastCalledWith(expect.objectContaining({
      capability: "repository.dev_server_restart",
      operationInput: expect.objectContaining({ serverId: "vite" }) as unknown,
    }));
  });
});
