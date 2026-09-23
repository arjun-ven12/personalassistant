import {
  EngineeringRepositorySchema,
  EngineeringTaskSchema,
  EngineeringWorkspaceSchema,
  type EngineeringTask,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import {
  EngineeringManagerService,
  type EngineeringTaskWorker,
  type EngineeringWorkspaceGateway,
} from "./service.js";
import { InMemoryEngineeringOrchestrationStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const otherCompanyId = "30000000-0000-4000-8000-000000000003";
const repositoryId = "40000000-0000-4000-8000-000000000004";
const baseCommit = "a".repeat(40);
const context = {
  ownerId,
  companyId,
  requestId: "request-27-2",
  ipAddress: "100.64.0.1",
  sessionId: "50000000-0000-4000-8000-000000000005",
  networkState: "PRIVATE_NETWORK" as const,
};
const audit = () => undefined;

class FakeWorkspaceGateway implements EngineeringWorkspaceGateway {
  readonly created: string[] = [];
  readonly cancelled: string[] = [];
  readonly prepared: string[] = [];
  prepareError: Error | null = null;
  constructor(readonly runtime: InMemoryEngineeringRuntimeStore) {}
  prepare(input: Parameters<EngineeringWorkspaceGateway["prepare"]>[0]) {
    this.prepared.push(input.workspaceId);
    return this.prepareError ? Promise.reject(this.prepareError) : Promise.resolve();
  }
  create(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    taskId: string;
    agentId: string;
    idempotencyKey: string;
    slug?: string;
    transport?: unknown;
  }) {
    const existing = this.runtime.findWorkspaceByIdempotencyKey(
      input.ownerId,
      input.companyId,
      input.repositoryId,
      input.idempotencyKey,
    );
    if (existing)
      return Promise.resolve({ id: existing.id, baseCommit: existing.baseCommit });
    const id = crypto.randomUUID();
    this.runtime.createWorkspace(
      EngineeringWorkspaceSchema.parse({
        schemaVersion: "1",
        id,
        ownerId: input.ownerId,
        companyId: input.companyId,
        repositoryId: input.repositoryId,
        taskId: input.taskId,
        agentId: input.agentId,
        idempotencyKey: input.idempotencyKey,
        branchName: `alexa/${input.taskId.replaceAll("-", "").slice(0, 12)}-${id.replaceAll("-", "").slice(-6)}-task`,
        worktreeLocator: `ew-${id}`,
        baseCommit,
        headCommit: null,
        state: "READY",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null,
      }),
    );
    this.created.push(id);
    return Promise.resolve({ id, baseCommit });
  }
  cancelExecutions(input: { workspaceId: string }) {
    this.cancelled.push(input.workspaceId);
    return Promise.resolve();
  }
}

class FakeWorker implements EngineeringTaskWorker {
  active = 0;
  maximumActive = 0;
  starts: EngineeringTask[] = [];
  attempts = new Map<string, number>();
  failOnceTypes = new Set<EngineeringTask["taskType"]>();
  blockTypes = new Set<EngineeringTask["taskType"]>();
  delayMs = 2;
  modelTiers: string[] = [];
  agentDefinitionIds: string[] = [];

  async execute(input: Parameters<EngineeringTaskWorker["execute"]>[0]) {
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    this.starts.push(input.task);
    this.modelTiers.push(input.modelTier);
    this.agentDefinitionIds.push(input.agentDefinitionId);
    const attempt = (this.attempts.get(input.task.id) ?? 0) + 1;
    this.attempts.set(input.task.id, attempt);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        input.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("cancelled"), { code: "CANCELLED" }));
          },
          { once: true },
        );
      });
      if (this.blockTypes.has(input.task.taskType))
        return {
          status: "BLOCKED" as const,
          failureCategory: "MISSING_CAPABILITY" as const,
          failureSummary: "Required registered capability is unavailable.",
        };
      if (this.failOnceTypes.has(input.task.taskType) && attempt === 1)
        return {
          status: "FAILED" as const,
          validationStatus: "FAIL" as const,
          failureCategory: "TEST_FAILURE" as const,
          failureSummary: "Synthetic first validation failure.",
        };
      return {
        status: "SUCCEEDED" as const,
        filesChanged: input.task.readOnly
          ? []
          : [`src/${input.task.taskType.toLowerCase()}.ts`],
        diffSummary: `${input.task.taskType} completed within scope.`,
        validationStatus: "PASS" as const,
        validationReportId: crypto.randomUUID(),
        modelProvider: "test-router",
        modelName: input.modelTier.toLowerCase(),
        inputTokens: 100,
        outputTokens: 50,
        costUsd: input.modelTier === "LUNA" ? "0.01" : "0.02",
        artifacts:
          input.task.taskType === "BACKEND"
            ? [
                {
                  type: "API_CONTRACT" as const,
                  title: "API contract",
                  summary: "Bounded preference endpoint contract.",
                  contract: { method: "PUT", route: "/preferences" },
                },
              ]
            : [],
      };
    } finally {
      this.active -= 1;
    }
  }

  review(input: Parameters<EngineeringTaskWorker["review"]>[0]) {
    expect(input.reviewerAgentId).not.toBe(input.authorAgentId);
    expect(input.reviewerAgentDefinitionId).not.toBe(input.authorAgentDefinitionId);
    return Promise.resolve({
      status: "PASS" as const,
      summary: "Independent review passed.",
    });
  }
}

const setup = async (worker = new FakeWorker(), now: () => Date = () => new Date()) => {
  const store = new InMemoryEngineeringOrchestrationStore();
  const runtime = new InMemoryEngineeringRuntimeStore();
  const agentStore = new InMemoryAgentStore();
  const agents = new AgentRegistryService(agentStore, audit, now);
  await companyScope.run(
    { ownerId, companyId, role: "OWNER", requestId: context.requestId },
    () => agents.ensureBuiltIns(ownerId, context.requestId),
  );
  const authorizedAgentIds = companyScope
    .run({ ownerId, companyId, role: "OWNER", requestId: context.requestId }, () =>
      agentStore.listAssignments(ownerId, companyId),
    )
    .map((assignment) => assignment.id);
  runtime.saveRepository(
    EngineeringRepositorySchema.parse({
      schemaVersion: "1",
      id: repositoryId,
      ownerId,
      companyId,
      displayName: "Alexa",
      workspaceLocatorId: "repo-main",
      defaultBranch: "main",
      protectedBranches: ["main"],
      protectedPaths: ["apps/api/src/auth/**"],
      generatedPaths: ["dist/**"],
      commandProfileId: "node-default",
      capabilityProfileId: "engineering-default",
      authorizedAgentIds,
      metadata: {
        languages: ["TypeScript"],
        packageManagers: ["pnpm"],
        frameworks: ["Fastify", "React"],
        importantFiles: ["package.json", "apps/api/src/app.ts"],
      },
      status: "ACTIVE",
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    }),
  );
  const workspaces = new FakeWorkspaceGateway(runtime);
  const service = new EngineeringManagerService(
    store,
    runtime,
    agentStore,
    agents,
    workspaces,
    worker,
    audit,
    now,
    1_000,
  );
  return { service, store, runtime, agentStore, workspaces, worker };
};

const create = (
  service: EngineeringManagerService,
  description = "Add a user preference API endpoint and web UI with tests.",
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM",
) =>
  service.create(context, {
    repositoryId,
    title: "User preferences",
    description,
    acceptanceCriteria: ["Preference can be saved and displayed."],
    constraints: ["No production deployment."],
    riskLevel,
    maxParallelTasks: 4,
  });

const runToTerminal = async (
  service: EngineeringManagerService,
  objectiveId: string,
  limit = 20,
) => {
  let view = await service.view(ownerId, companyId, objectiveId);
  for (
    let index = 0;
    index < limit &&
    !["COMPLETED", "BLOCKED", "FAILED", "CANCELLED"].includes(view.objective.status);
    index += 1
  )
    view = await service.runReady(context, objectiveId, `worker-${index}`);
  return view;
};

describe("EngineeringManagerService", () => {
  it("recovers the original authorized worktree agent after a legacy reassignment", async () => {
    const { service, store, runtime, workspaces, worker } = await setup();
    const planned = await create(service);
    const task = planned.tasks.find((item) => item.taskType === "FRONTEND")!;
    const workspace = await workspaces.create({ ownerId, companyId, repositoryId, taskId: task.id, agentId: task.assignedAgentId!, idempotencyKey: task.id });
    const wrongAgent = planned.tasks.find((item) => item.assignedAgentId !== task.assignedAgentId)!.assignedAgentId;
    for (const other of planned.tasks) store.saveTask({ ...other, status: other.id === task.id ? "BLOCKED" : "COMPLETE" });
    store.saveTask({ ...task, workspaceId: workspace.id, assignedAgentId: wrongAgent, status: "BLOCKED", lastFailureCategory: "POLICY_DENIED", lastFailureSummary: "Scope mismatch" });
    store.saveObjective({ ...planned.objective, status: "BLOCKED" });
    await service.resume(context, planned.objective.id);
    expect(worker.starts.find((item) => item.id === task.id)?.assignedAgentId).toBe(task.assignedAgentId);
    expect(runtime.findWorkspace(ownerId, companyId, workspace.id)?.agentId).toBe(task.assignedAgentId);
    expect(workspaces.created).toHaveLength(1);
  });

  it("blocks before a paid worker call when governed dependency preparation fails", async () => {
    const { service, workspaces, worker } = await setup();
    workspaces.prepareError = Object.assign(new Error("Governed dependency preparation failed."), { code: "DEPENDENCY_INSTALL_FAILED" });
    const planned = await create(service, "Change the CTA text from Get Started to Contact Me.");
    const finished = await runToTerminal(service, planned.objective.id);
    expect(finished.objective.status).toBe("BLOCKED");
    expect(worker.starts).toHaveLength(0);
    expect(workspaces.created).toHaveLength(1);
    expect(new Set(workspaces.prepared)).toEqual(new Set(workspaces.created));
    expect(finished.tasks[0]).toMatchObject({ lastFailureCategory: "ENVIRONMENT_FAILURE", modelPolicy: { currentTier: "LUNA" } });
  });

  it("matches authorized company assignments independently of organizational grouping", async () => {
    const { service, agentStore } = await setup();
    const assignments = agentStore.listAssignments(ownerId, companyId);
    for (const assignment of assignments)
      agentStore.saveAssignment({ ...assignment, organizationId: otherCompanyId });

    const planned = await create(service);

    expect(planned.tasks).not.toHaveLength(0);
    expect(planned.tasks.every((task) => Boolean(task.assignedAgentId))).toBe(true);
  });

  it("recovers an existing delivery blocked only by the corrected agent matcher", async () => {
    const { service, store, agentStore } = await setup();
    const assignments = agentStore.listAssignments(ownerId, companyId);
    for (const assignment of assignments)
      agentStore.saveAssignment({ ...assignment, organizationId: otherCompanyId });
    const planned = await create(service);
    const architecture = planned.tasks.find(
      (task) => task.taskType === "ARCHITECTURE",
    )!;
    store.saveTask(
      EngineeringTaskSchema.parse({
        ...architecture,
        assignedAgentId: null,
        status: "BLOCKED",
        lastFailureCategory: "MISSING_CAPABILITY",
        lastFailureSummary: "No eligible existing logical agent was available.",
      }),
    );
    for (const task of planned.tasks.filter((item) => item.id !== architecture.id))
      store.saveTask(
        EngineeringTaskSchema.parse({
          ...task,
          status: "BLOCKED",
          lastFailureCategory: "DEPENDENCY_NOT_READY",
          lastFailureSummary: "A required predecessor did not complete.",
        }),
      );
    store.saveObjective({
      ...planned.objective,
      status: "BLOCKED",
      version: planned.objective.version + 1,
    });

    const recovered = await service.resume(context, planned.objective.id);

    expect(recovered.objective.status).toBe("COMPLETED");
    expect(
      recovered.tasks.find((task) => task.id === architecture.id)?.assignedAgentId,
    ).not.toBeNull();
  });

  it.each(["MODEL_FAILURE", "MISSING_CAPABILITY"] as const)("retries the same assigned bounded task after a %s blocker is fixed", async (failureCategory) => {
    const { service, store, agentStore, worker } = await setup();
    const planned = await create(service);
    const architecture = planned.tasks.find(
      (task) => task.taskType === "ARCHITECTURE",
    )!;
    store.saveTask(
      EngineeringTaskSchema.parse({
        ...architecture,
        status: "BLOCKED",
        attempt: 4,
        maxAttempts: 4,
        lastFailureCategory: failureCategory,
        lastFailureSummary: "Provider rejected the structured-output schema.",
      }),
    );
    for (const task of planned.tasks.filter((item) => item.id !== architecture.id))
      store.saveTask(
        EngineeringTaskSchema.parse({
          ...task,
          status: "BLOCKED",
          lastFailureCategory: "DEPENDENCY_NOT_READY",
          lastFailureSummary: "A required predecessor did not complete.",
        }),
      );
    store.saveObjective({
      ...planned.objective,
      status: "BLOCKED",
      version: planned.objective.version + 1,
    });

    const recovered = await service.resume(context, planned.objective.id);

    expect(recovered.tasks.find((task) => task.id === architecture.id)).toMatchObject({
      status: "COMPLETE",
      attempt: 1,
      lastFailureCategory: null,
    });
    const assignment = agentStore
      .listAssignments(ownerId, companyId)
      .find((item) => item.id === architecture.assignedAgentId)!;
    expect(worker.agentDefinitionIds).toContain(assignment.agentDefinitionId);
    expect(worker.agentDefinitionIds).not.toContain(architecture.assignedAgentId);
  });

  it("creates one scoped integration repair task and executes it through the existing worker/workspace path", async () => {
    const { service, store, runtime } = await setup();
    const planned = await create(service);
    const completed = await runToTerminal(service, planned.objective.id);
    expect(completed.objective.status).toBe("COMPLETED");
    const parent = completed.tasks.find(
      (task) => !task.readOnly && task.status === "COMPLETE",
    )!;
    const input = {
      objectiveId: planned.objective.id,
      integrationRunId: crypto.randomUUID(),
      cycle: 1,
      parentTaskId: parent.id,
      category: "TEST_FAILURE",
      summary: "Combined registered test failed in one bounded domain.",
    };
    const repair = await service.createIntegrationRepairTask(context, input);
    expect((await service.createIntegrationRepairTask(context, input)).id).toBe(
      repair.id,
    );
    expect(repair.parentTaskId).toBe(parent.id);
    expect(repair.status).toBe("READY");
    expect(store.findObjective(ownerId, companyId, planned.objective.id)?.status).toBe(
      "READY",
    );
    const repaired = await runToTerminal(service, planned.objective.id);
    const finalTask = repaired.tasks.find((task) => task.id === repair.id)!;
    expect(finalTask.status).toBe("COMPLETE");
    expect(finalTask.workspaceId).not.toBeNull();
    expect(
      runtime.findWorkspace(ownerId, companyId, finalTask.workspaceId!)?.taskId,
    ).toBe(repair.id);
    expect(
      repaired.results.some(
        (result) => result.taskId === repair.id && result.validationStatus === "PASS",
      ),
    ).toBe(true);
    await expect(
      service.createIntegrationRepairTask(
        { ...context, companyId: otherCompanyId },
        input,
      ),
    ).rejects.toMatchObject({ code: "OBJECTIVE_NOT_FOUND" });
  });
  it("decomposes a simple feature into a bounded dependency graph and passes contracts structurally", async () => {
    const { service, worker } = await setup();
    const planned = await create(service);
    expect(planned.tasks.map((task) => task.taskType)).toEqual([
      "ARCHITECTURE",
      "BACKEND",
      "FRONTEND",
      "TESTING",
      "INTEGRATION_PREP",
    ]);
    expect(planned.tasks.filter((task) => task.status === "READY")).toHaveLength(1);
    const completed = await runToTerminal(service, planned.objective.id);
    expect(completed.objective.status).toBe("COMPLETED");
    expect(completed.readyForIntegration).toBe(true);
    expect(completed.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "API_CONTRACT" })]),
    );
    const frontendStart = worker.starts.find((task) => task.taskType === "FRONTEND");
    const backendStart = worker.starts.find((task) => task.taskType === "BACKEND");
    expect(frontendStart?.dependencies).toContain(backendStart?.id);
  });

  it("uses one governed worker for a narrow text edit while retaining validation and integration readiness", async () => {
    const { service, worker } = await setup();
    const planned = await create(
      service,
      "Change the CTA text from Get Started to Contact Me.",
      "MEDIUM",
    );
    expect(planned.tasks).toHaveLength(1);
    expect(planned.tasks[0]).toMatchObject({
      assignedRole: "GENERALIST_ENGINEER",
      modelPolicy: { initialTier: "LUNA" },
      readOnly: false,
    });
    const completed = await runToTerminal(service, planned.objective.id);
    expect(completed.objective.status).toBe("COMPLETED");
    expect(completed.readyForIntegration).toBe(true);
    expect(worker.starts).toHaveLength(1);
  });

  it("routes project dependency additions and removals through finite governed capabilities", async () => {
    const { service } = await setup();
    const added = await create(service, "Add Recharts to this project.", "MEDIUM");
    expect(
      added.tasks.find((task) => task.title.includes("dependency"))
        ?.requiredCapabilities,
    ).toContain("repository.add_dependency");
    const removed = await create(service, "Remove lodash from this project.", "MEDIUM");
    expect(
      removed.tasks.find((task) => task.title.includes("dependency"))
        ?.requiredCapabilities,
    ).toContain("repository.remove_dependency");
  });

  it("replans an active objective with one bounded requirement task and updated acceptance criteria", async () => {
    const { service } = await setup();
    const planned = await create(service, "Build responsive pricing cards.", "MEDIUM");
    const before = planned.tasks.length;
    const task = await service.addInstruction(
      context,
      planned.objective.id,
      "Also make the cards horizontally scrollable on mobile.",
      "instruction-replan-123",
    );
    const updated = await service.view(ownerId, companyId, planned.objective.id);
    expect(updated.tasks).toHaveLength(before + 1);
    expect(task.title).toContain("Additional requirement");
    expect(updated.objective.acceptanceCriteria).toContain(
      "Also make the cards horizontally scrollable on mobile.",
    );
  });

  it("runs a 10-task objective with bounded four-way concurrency and no duplicate execution", async () => {
    const worker = new FakeWorker();
    worker.delayMs = 15;
    const { service } = await setup(worker);
    const planned = await create(
      service,
      "Add database migration, backend API, frontend UI, Android mobile, Mac native, Docker infrastructure, tests, auth security review and integration notes.",
      "HIGH",
    );
    expect(planned.tasks.length).toBeGreaterThanOrEqual(8);
    expect(planned.tasks.length).toBeLessThanOrEqual(12);
    const completed = await runToTerminal(service, planned.objective.id);
    expect(completed.objective.status).toBe("COMPLETED");
    expect(worker.maximumActive).toBeGreaterThanOrEqual(3);
    expect(worker.maximumActive).toBeLessThanOrEqual(4);
    expect(new Set(worker.starts.map((task) => task.id)).size).toBe(
      worker.starts.length,
    );
  });

  it("does not start dependent tasks early", async () => {
    const { service, worker } = await setup();
    const planned = await create(service);
    await service.runReady(context, planned.objective.id, "worker-a");
    const order = worker.starts.map((task) => task.taskType);
    expect(order.indexOf("ARCHITECTURE")).toBeLessThan(order.indexOf("BACKEND"));
    expect(order.indexOf("BACKEND")).toBeLessThan(order.indexOf("FRONTEND"));
    expect(order.indexOf("FRONTEND")).toBeLessThan(order.indexOf("TESTING"));
  });

  it("classifies a validation failure and escalates Luna to Terra on a bounded retry", async () => {
    const worker = new FakeWorker();
    worker.failOnceTypes.add("BACKEND");
    const { service } = await setup(worker);
    const planned = await create(
      service,
      "Add a routine backend endpoint and tests.",
      "LOW",
    );
    const completed = await runToTerminal(service, planned.objective.id);
    expect(completed.objective.status).toBe("COMPLETED");
    const backend = completed.tasks.find((task) => task.taskType === "BACKEND")!;
    expect(backend.attempt).toBe(2);
    expect(backend.modelPolicy.initialTier).toBe("LUNA");
    expect(backend.modelPolicy.currentTier).toBe("TERRA");
    expect(completed.events.some((event) => event.type === "MODEL_ESCALATED")).toBe(
      true,
    );
  });

  it("starts security work at Sol and enforces an independent reviewer", async () => {
    const { service } = await setup();
    const planned = await create(
      service,
      "Change auth permission and tenant isolation behavior with tests.",
      "CRITICAL",
    );
    const security = planned.tasks.find((task) => task.taskType === "SECURITY")!;
    expect(security.modelPolicy.initialTier).toBe("SOL");
    expect(security.reviewRequired).toBe(true);
    expect(security.reviewerAgentId).not.toBe(security.assignedAgentId);
    const completed = await runToTerminal(service, planned.objective.id);
    expect(
      completed.results.find((result) => result.taskId === security.id)?.reviewStatus,
    ).toBe("PASS");
  });

  it("records a missing capability instead of self-granting", async () => {
    const worker = new FakeWorker();
    worker.blockTypes.add("BACKEND");
    const { service } = await setup(worker);
    const planned = await create(service, "Add a backend endpoint.");
    const blocked = await runToTerminal(service, planned.objective.id);
    expect(blocked.objective.status).toBe("BLOCKED");
    expect(blocked.events.some((event) => event.type === "CAPABILITY_REQUESTED")).toBe(
      true,
    );
    expect(blocked.tasks.find((task) => task.taskType === "BACKEND")?.status).toBe(
      "BLOCKED",
    );
  });

  it("asks for clarification on critical product ambiguity without creating tasks", async () => {
    const { service } = await setup();
    const result = await create(service, "Delete a user and all related data.", "HIGH");
    expect(result.objective.status).toBe("NEEDS_CLARIFICATION");
    expect(result.objective.clarificationQuestion).toMatch(/historical audit/);
    expect(result.tasks).toEqual([]);
  });

  it("accepts one idempotent owner clarification and resumes the existing objective", async () => {
    const { service } = await setup();
    const blocked = await create(
      service,
      "Delete a user and all related data.",
      "HIGH",
    );
    const clarificationId = blocked.objective.clarification!.id;
    const body = {
      answer:
        "Preserve immutable audit and activity history; remove only the active profile.",
      idempotencyKey: "clarification-answer-0001",
    };
    const resumed = await service.answerClarification(
      context,
      blocked.objective.id,
      clarificationId,
      body,
    );
    expect(resumed.objective.status).toBe("COMPLETED");
    expect(resumed.objective.clarification).toMatchObject({
      status: "ANSWERED",
      answerIdempotencyKey: body.idempotencyKey,
    });
    const duplicate = await service.answerClarification(
      context,
      blocked.objective.id,
      clarificationId,
      body,
    );
    expect(duplicate.results).toHaveLength(resumed.results.length);
    expect(
      duplicate.events.filter((event) => event.type === "OWNER_CLARIFICATION_ANSWERED"),
    ).toHaveLength(1);
  });

  it("rejects changed duplicate and cancelled clarification answers", async () => {
    const { service } = await setup();
    const first = await create(service, "Delete a user and all related data.", "HIGH");
    await service.answerClarification(
      context,
      first.objective.id,
      first.objective.clarification!.id,
      { answer: "Preserve audit history.", idempotencyKey: "answer-key-00000001" },
    );
    await expect(
      service.answerClarification(
        context,
        first.objective.id,
        first.objective.clarification!.id,
        { answer: "Erase audit history.", idempotencyKey: "answer-key-00000001" },
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const second = await create(service, "Delete a user and all related data.", "HIGH");
    await service.cancel(context, second.objective.id);
    await expect(
      service.answerClarification(
        context,
        second.objective.id,
        second.objective.clarification!.id,
        { answer: "Preserve audit history.", idempotencyKey: "answer-key-00000002" },
      ),
    ).rejects.toMatchObject({ code: "CLARIFICATION_STALE" });
  });

  it("binds task execution to Agent OS, Workforce matching, and scoped memory", async () => {
    const { service } = await setup();
    const sessions: string[] = [];
    const completed: string[] = [];
    const matches: string[][] = [];
    const retrievals: string[] = [];
    const promotions: string[] = [];
    service.setAgentOs({
      start: ({ task }) => {
        sessions.push(task.id);
        return Promise.resolve({ sessionId: crypto.randomUUID() });
      },
      complete: ({ sessionId }) => {
        completed.push(sessionId);
        return Promise.resolve();
      },
    });
    service.setWorkforceMatcher({
      rank: ({ eligibleAgentDefinitionIds }) => {
        matches.push(eligibleAgentDefinitionIds);
        return Promise.resolve(eligibleAgentDefinitionIds);
      },
    });
    service.setMemory({
      retrieve: ({ companyId: scope, taskId }) => {
        expect(scope).toBe(companyId);
        retrievals.push(taskId);
        return Promise.resolve({
          refs: [],
          summaries: ["Use the registered validation profile."],
        });
      },
      promote: ({ companyId: scope, taskId }) => {
        expect(scope).toBe(companyId);
        promotions.push(taskId);
        return Promise.resolve();
      },
    });
    const planned = await create(service, "Add a backend endpoint with tests.");
    const completedView = await runToTerminal(service, planned.objective.id);
    expect(completedView.objective.status).toBe("COMPLETED");
    expect(matches.length).toBeGreaterThan(0);
    expect(sessions).toHaveLength(completedView.tasks.length);
    expect(completed).toHaveLength(completedView.tasks.length);
    expect(retrievals).toHaveLength(completedView.tasks.length);
    expect(promotions.length).toBeGreaterThan(0);
    expect(completedView.tasks.every((task) => Boolean(task.agentSessionId))).toBe(
      true,
    );
  });

  it("stops new work on cancellation while preserving created workspaces", async () => {
    const worker = new FakeWorker();
    worker.delayMs = 200;
    const { service, workspaces, runtime } = await setup(worker);
    const planned = await create(
      service,
      "Add database, backend, mobile, Mac native and infrastructure changes with tests.",
    );
    const running = service.runReady(context, planned.objective.id, "cancel-worker");
    await new Promise((resolve) => setTimeout(resolve, 230));
    const cancelled = await service.cancel(context, planned.objective.id);
    await running;
    expect(cancelled.objective.status).toBe("CANCELLED");
    expect(runtime.listWorkspaces(ownerId, companyId).length).toBeGreaterThan(0);
    expect(workspaces.cancelled.length).toBeGreaterThan(0);
    expect(
      (await service.view(ownerId, companyId, planned.objective.id)).tasks.every(
        (task) => ["COMPLETE", "CANCELLED"].includes(task.status),
      ),
    ).toBe(true);
  });

  it("recovers an expired active task without duplicating its workspace", async () => {
    let current = new Date("2026-09-16T00:00:00.000Z");
    const now = () => new Date(current);
    const { service, store, workspaces, runtime, agentStore } = await setup(
      new FakeWorker(),
      now,
    );
    const planned = await create(service, "Add a backend endpoint.");
    const tasks = (await service.view(ownerId, companyId, planned.objective.id)).tasks;
    const architecture = tasks.find((task) => task.taskType === "ARCHITECTURE")!;
    const backend = tasks.find((task) => task.taskType === "BACKEND")!;
    store.saveTask(
      EngineeringTaskSchema.parse({
        ...architecture,
        status: "COMPLETE",
        completedAt: current.toISOString(),
        updatedAt: current.toISOString(),
      }),
    );
    const workspace = await workspaces.create({
      ownerId,
      companyId,
      repositoryId,
      taskId: backend.id,
      agentId: backend.assignedAgentId!,
      idempotencyKey: backend.id,
      slug: "backend",
      transport: {
        sessionId: context.sessionId,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        networkState: context.networkState,
      },
    });
    store.saveTask(
      EngineeringTaskSchema.parse({
        ...backend,
        workspaceId: workspace.id,
        status: "READY",
        updatedAt: current.toISOString(),
      }),
    );
    const claimed = store.acquireTaskLease({
      ownerId,
      companyId,
      taskId: backend.id,
      workerId: "crashed",
      now: current.toISOString(),
      expiresAt: new Date(current.getTime() + 1_000).toISOString(),
    });
    expect(claimed?.status).toBe("ACTIVE");
    current = new Date(current.getTime() + 2_000);
    const restarted = new EngineeringManagerService(
      store,
      runtime,
      agentStore,
      new AgentRegistryService(agentStore, audit, now),
      workspaces,
      new FakeWorker(),
      audit,
      now,
      1_000,
    );
    const recovered = await restarted.recover(context, planned.objective.id);
    expect(recovered.events.some((event) => event.type === "OBJECTIVE_RECOVERED")).toBe(
      true,
    );
    const backendWorkspaces = runtime.listWorkspaces(ownerId, companyId, repositoryId);
    expect(backendWorkspaces.filter((item) => item.taskId === backend.id)).toHaveLength(
      1,
    );
  });

  it("enforces company scope and attributes task and objective cost", async () => {
    const { service } = await setup();
    await expect(
      service.create(
        { ...context, companyId: otherCompanyId },
        {
          repositoryId,
          title: "Cross tenant",
          description: "Add endpoint",
          acceptanceCriteria: ["Done"],
        },
      ),
    ).rejects.toMatchObject({ code: "REPOSITORY_NOT_AUTHORIZED" });
    const planned = await create(service);
    const completed = await runToTerminal(service, planned.objective.id);
    const resultTotal = completed.results.reduce(
      (sum, result) => sum + Number(result.costUsd),
      0,
    );
    expect(Number(completed.objective.totalCostUsd)).toBeCloseTo(resultTotal);
    expect(
      completed.results.every((result) => result.modelProvider === "test-router"),
    ).toBe(true);
  });
});

describe("InMemoryEngineeringOrchestrationStore lease fencing", () => {
  it("rejects stale-holder mutation after lease expiry", () => {
    const store = new InMemoryEngineeringOrchestrationStore();
    const task = EngineeringTaskSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      objectiveId: crypto.randomUUID(),
      parentTaskId: null,
      repositoryId,
      workspaceId: null,
      title: "Lease task",
      description: "Test lease fencing.",
      acceptanceCriteria: ["Stale mutation denied."],
      taskType: "BACKEND",
      requiredSkills: [],
      requiredCapabilities: [],
      dependencies: [],
      riskLevel: "LOW",
      estimatedDifficulty: "LOW",
      assignedAgentId: "coding_agent",
      assignedRole: "BACKEND_ENGINEER",
      reviewerAgentId: null,
      modelPolicy: {
        initialTier: "LUNA",
        currentTier: "LUNA",
        maxTier: "SOL",
        escalationCount: 0,
        reason: "test",
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
      createdAt: "2026-09-16T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    store.saveTask(task);
    const claimed = store.acquireTaskLease({
      ownerId,
      companyId,
      taskId: task.id,
      workerId: "one",
      now: "2026-09-16T00:00:00.000Z",
      expiresAt: "2026-09-16T00:00:01.000Z",
    })!;
    expect(
      store.saveTaskFenced(
        claimed,
        "one",
        claimed.leaseGeneration,
        "2026-09-16T00:00:02.000Z",
      ),
    ).toBe(false);
    expect(
      store.releaseTaskLease({
        ownerId,
        companyId,
        taskId: task.id,
        workerId: "one",
        generation: claimed.leaseGeneration,
        now: "2026-09-16T00:00:02.000Z",
      }),
    ).toBe(false);
  });
});
