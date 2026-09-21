import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  EngineeringCommandProfileSchema,
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
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

const fixture = () => {
  const store = new InMemoryEngineeringDeliveryStore();
  const runtime = new InMemoryEngineeringRuntimeStore();
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
    cancel: vi.fn(),
    addInstruction: vi.fn(),
  } as unknown as EngineeringManagerService;
  const integrationView = {
    run: { id: runId, status: "READY", integrationWorkspaceId: workspaceId },
    candidate: { id: candidateId, status: "READY", filesChanged: ["src/App.tsx"] },
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
    () => new Date(at),
  );
  return {
    service,
    gateway,
    managerRunReady,
    integrationExecute,
    gatewayInvoke,
    notificationDispatch,
  };
};

describe("EngineeringDeliveryService", () => {
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
});
