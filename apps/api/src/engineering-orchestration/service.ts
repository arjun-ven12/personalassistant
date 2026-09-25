import { createHash } from "node:crypto";

import {
  AnswerEngineeringClarificationRequestSchema,
  CreateEngineeringObjectiveRequestSchema,
  EngineeringArtifactSchema,
  EngineeringContextPackageSchema,
  EngineeringEventSchema,
  EngineeringObjectiveSchema,
  EngineeringObjectiveViewSchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
  type EngineeringAgentRole,
  type EngineeringArtifactTypeSchema,
  type EngineeringContextPackage,
  type EngineeringFailureCategory,
  type EngineeringModelTier,
  type EngineeringObjective,
  type EngineeringTask,
  type EngineeringTaskResult,
  type EngineeringTaskType,
} from "@alexa-control/shared";
import type { z } from "zod";
import type { NetworkVerificationState } from "@alexa-control/shared";

import type { AgentRegistryService } from "../agents/service.js";
import type { AgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringOrchestrationStore } from "./store.js";

type ArtifactType = z.infer<typeof EngineeringArtifactTypeSchema>;

const TIER_ORDER: EngineeringModelTier[] = ["LUNA", "TERRA", "SOL", "ASTRA"];
const MUTATING_TASKS = new Set<EngineeringTaskType>([
  "BACKEND",
  "FRONTEND",
  "DATABASE",
  "ANDROID",
  "MAC_NATIVE",
  "TESTING",
  "INFRASTRUCTURE",
  "DOCUMENTATION",
  "INTEGRATION_PREP",
]);
const REVIEW_TASKS = new Set<EngineeringTaskType>([
  "DATABASE",
  "SECURITY",
  "INFRASTRUCTURE",
]);
const NON_RETRYABLE = new Set<EngineeringFailureCategory>([
  "POLICY_DENIED",
  "AMBIGUOUS_REQUIREMENT",
  "MISSING_CAPABILITY",
  "CONFLICT",
]);

export class EngineeringOrchestrationError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code:
      | "OBJECTIVE_NOT_FOUND"
      | "TASK_NOT_FOUND"
      | "REPOSITORY_NOT_AUTHORIZED"
      | "INVALID_STATE"
      | "REPLAN_LIMIT_REACHED"
      | "CLARIFICATION_NOT_FOUND"
      | "CLARIFICATION_STALE"
      | "IDEMPOTENCY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "EngineeringOrchestrationError";
    this.statusCode = code.endsWith("NOT_FOUND") ? 404 : code === "REPOSITORY_NOT_AUTHORIZED" ? 403 : 409;
  }
}

export interface EngineeringWorkspaceGateway {
  create(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    taskId: string;
    agentId: string;
    idempotencyKey: string;
    slug: string;
    repairBaseCommit?: string | null;
    repairIntegrationWorkspaceId?: string | null;
    repairObjectiveId?: string | null;
    transport: {
      sessionId: string;
      requestId: string;
      ipAddress: string;
      networkState: NetworkVerificationState;
      deviceId?: string;
    };
  }): Promise<{ id: string; baseCommit: string }>;
  prepare(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string;
    taskId: string;
    agentId: string;
    signal: AbortSignal;
    transport: {
      sessionId: string;
      requestId: string;
      ipAddress: string;
      networkState: NetworkVerificationState;
      deviceId?: string;
    };
  }): Promise<void>;
  cancelExecutions(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    reason: string;
  }): Promise<void>;
}

export interface EngineeringTaskWorker {
  execute(input: {
    objective: EngineeringObjective;
    task: EngineeringTask;
    agentDefinitionId: string;
    context: EngineeringContextPackage;
    modelTier: EngineeringModelTier;
    workspaceId: string | null;
    signal: AbortSignal;
    transport: {
      sessionId: string;
      requestId: string;
      ipAddress: string;
      networkState: NetworkVerificationState;
      deviceId?: string;
    };
  }): Promise<{
    status: "SUCCEEDED" | "FAILED" | "BLOCKED";
    filesChanged?: string[];
    diffSummary?: string;
    validationStatus?: "PASS" | "FAIL" | "SKIPPED" | "NOT_CONFIGURED" | "ERROR";
    validationReportId?: string | null;
    failureCategory?: EngineeringFailureCategory | null;
    failureSummary?: string | null;
    warnings?: string[];
    artifacts?: Array<{
      type: ArtifactType;
      title: string;
      summary: string;
      contract?: Record<string, unknown>;
    }>;
    modelProvider?: string | null;
    modelName?: string | null;
    aiRequestId?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: string;
  }>;
  review(input: {
    objective: EngineeringObjective;
    task: EngineeringTask;
    authorAgentId: string;
    reviewerAgentId: string;
    authorAgentDefinitionId: string;
    reviewerAgentDefinitionId: string;
    context: EngineeringContextPackage;
    modelTier: EngineeringModelTier;
    workspaceId: string | null;
    signal: AbortSignal;
  }): Promise<{ status: "PASS" | "FAIL"; summary: string }>;
}

export interface EngineeringAgentOsGateway {
  start(input: {
    objective: EngineeringObjective;
    task: EngineeringTask;
    specialistAgentId: string;
    memoryRefs: string[];
    requestId: string;
  }): Promise<{ sessionId: string }>;
  complete(input: {
    ownerId: string;
    sessionId: string;
    outputSummary: string;
    confidence: number;
    aiRequestId: string;
    providerId: string;
    modelId: string;
    artifactCount: number;
    sandboxStatus: "PASSED" | "FAILED" | "UNAVAILABLE";
    errorCode: string | null;
    requestId: string;
  }): Promise<void>;
}

export interface EngineeringWorkforceMatcher {
  rank(input: {
    ownerId: string;
    companyId: string;
    objectiveId: string;
    taskType: EngineeringTaskType;
    role: EngineeringAgentRole;
    skills: string[];
    capabilities: EngineeringTask["requiredCapabilities"];
    riskLevel: EngineeringTask["riskLevel"];
    eligibleAgentDefinitionIds: string[];
  }): Promise<string[]>;
}

export interface EngineeringMemoryGateway {
  retrieve(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    agentId: string;
    taskId: string;
  }): Promise<{ refs: string[]; summaries: string[] }>;
  promote(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    agentId: string;
    taskId: string;
    resultId: string;
    artifacts: Array<{ type: ArtifactType; title: string; summary: string }>;
    requestId: string;
    ipAddress: string;
  }): Promise<void>;
}

export class UnavailableEngineeringTaskWorker implements EngineeringTaskWorker {
  execute() {
    return Promise.resolve({
      status: "BLOCKED" as const,
      failureCategory: "ENVIRONMENT_FAILURE" as const,
      failureSummary:
        "No production engineering worker is configured for the signed Mac-agent transport.",
    });
  }
  review() {
    return Promise.resolve({
      status: "FAIL" as const,
      summary: "Review worker unavailable.",
    });
  }
}

export class UnavailableEngineeringWorkspaceGateway implements EngineeringWorkspaceGateway {
  create(): Promise<{ id: string; baseCommit: string }> {
    return Promise.reject(
      Object.assign(
        new Error("The governed Phase 27.1 workspace gateway is unavailable."),
        { code: "ENGINEERING_WORKSPACE_GATEWAY_UNAVAILABLE" },
      ),
    );
  }
  prepare(): Promise<void> {
    return Promise.reject(Object.assign(new Error("The governed dependency preparation gateway is unavailable."), { code: "ENGINEERING_WORKSPACE_GATEWAY_UNAVAILABLE" }));
  }
  cancelExecutions() {
    return Promise.resolve();
  }
}

type ManagerContext = {
  ownerId: string;
  companyId: string;
  requestId: string;
  ipAddress: string;
  sessionId: string;
  networkState: NetworkVerificationState;
  deviceId?: string;
};

type TaskSeed = {
  key: string;
  title: string;
  description: string;
  type: EngineeringTaskType;
  role: EngineeringAgentRole;
  dependencies: string[];
  skills: string[];
  capabilities: EngineeringTask["requiredCapabilities"];
  readOnly?: boolean;
  risk?: EngineeringTask["riskLevel"];
};

const roleAgentPreference: Record<EngineeringAgentRole, string[]> = {
  ENGINEERING_MANAGER: ["engineering_manager"],
  BACKEND_ENGINEER: ["coding_agent"],
  FRONTEND_ENGINEER: ["coding_agent"],
  DATABASE_ENGINEER: ["coding_agent", "planning_agent"],
  MOBILE_ENGINEER: ["coding_agent"],
  TEST_QA_ENGINEER: ["testing_agent", "coding_agent"],
  SECURITY_REVIEWER: ["security_agent", "review_agent"],
  GENERALIST_ENGINEER: ["coding_agent", "planning_agent"],
  MAC_NATIVE_ENGINEER: ["coding_agent"],
  DEVOPS_INFRASTRUCTURE_ENGINEER: ["coding_agent", "planning_agent"],
};

const bounded = (value: string, max: number) => value.slice(0, max);
const money = (value: number) =>
  value.toFixed(8).replace(/0+$/, "").replace(/\.$/, ".0");

export class EngineeringManagerService {
  readonly #active = new Map<string, Map<string, AbortController>>();
  private agentOs?: EngineeringAgentOsGateway;
  private workforceMatcher?: EngineeringWorkforceMatcher;
  private memory?: EngineeringMemoryGateway;

  constructor(
    readonly store: EngineeringOrchestrationStore,
    readonly runtimeStore: EngineeringRuntimeStore,
    readonly agentStore: AgentStore,
    readonly agents: AgentRegistryService,
    readonly workspaces: EngineeringWorkspaceGateway,
    readonly worker: EngineeringTaskWorker,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly leaseMs = 120_000,
  ) {}

  setAgentOs(gateway: EngineeringAgentOsGateway) {
    this.agentOs = gateway;
  }

  setWorkforceMatcher(matcher: EngineeringWorkforceMatcher) {
    this.workforceMatcher = matcher;
  }

  setMemory(gateway: EngineeringMemoryGateway) {
    this.memory = gateway;
  }

  async addInstruction(
    context: ManagerContext,
    objectiveId: string,
    instruction: string,
    idempotencyKey: string,
  ) {
    if (
      instruction.trim().length < 3 ||
      instruction.length > 2_000 ||
      idempotencyKey.length < 8
    )
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "The bounded engineering instruction is invalid.",
      );
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (
      ["COMPLETED", "FAILED", "CANCELLED", "NEEDS_CLARIFICATION"].includes(
        objective.status,
      )
    )
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "This objective cannot accept a mid-execution instruction.",
      );
    const digest = createHash("sha256")
      .update(`${objective.id}:${idempotencyKey}`)
      .digest("hex");
    const taskId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const existing = await this.store.findTask(
      context.ownerId,
      context.companyId,
      taskId,
    );
    if (existing) return existing;
    const tasks = await this.store.listTasks(
      context.ownerId,
      context.companyId,
      objective.id,
    );
    const lower = instruction.toLowerCase();
    const taskType: EngineeringTaskType =
      /page|ui|design|component|navigation|responsive|faq|testimonial/.test(lower)
        ? "FRONTEND"
        : /test|qa/.test(lower)
          ? "TESTING"
          : "BACKEND";
    const role: EngineeringAgentRole =
      taskType === "FRONTEND"
        ? "FRONTEND_ENGINEER"
        : taskType === "TESTING"
          ? "TEST_QA_ENGINEER"
          : "GENERALIST_ENGINEER";
    const capabilities = [
      "repository.search",
      "repository.file_read",
      "repository.file_patch",
      "repository.file_create",
      "repository.validate",
    ] as EngineeringTask["requiredCapabilities"];
    const agentId = await this.matchAgent(
      objective,
      role,
      ["implementation"],
      capabilities,
      taskType,
      objective.riskLevel,
    );
    if (!agentId)
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "No repository-authorized agent is available for the added instruction.",
      );
    const dependencies = tasks
      .filter(
        (task) => !task.readOnly && !["COMPLETE", "CANCELLED"].includes(task.status),
      )
      .map((task) => task.id)
      .slice(0, 20);
    const at = this.now().toISOString();
    const task = EngineeringTaskSchema.parse({
      schemaVersion: "1",
      id: taskId,
      ownerId: objective.ownerId,
      companyId: objective.companyId,
      objectiveId: objective.id,
      parentTaskId: null,
      repositoryId: objective.repositoryId,
      workspaceId: null,
      title: bounded(`Additional requirement: ${instruction}`, 255),
      description: bounded(instruction, 4_000),
      acceptanceCriteria: [bounded(instruction, 1_000)],
      taskType,
      requiredSkills: ["implementation"],
      requiredCapabilities: capabilities,
      dependencies,
      riskLevel: objective.riskLevel,
      estimatedDifficulty: "LOW",
      assignedAgentId: agentId,
      assignedRole: role,
      reviewerAgentId: null,
      modelPolicy: {
        initialTier: "LUNA",
        currentTier: "LUNA",
        maxTier: "SOL",
        escalationCount: 0,
        reason: "A bounded incremental requirement starts with Luna.",
      },
      readOnly: false,
      reviewRequired: false,
      status: dependencies.length ? "PLANNED" : "READY",
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
    const updated = EngineeringObjectiveSchema.parse({
      ...objective,
      constraints: [
        ...objective.constraints,
        bounded(`Additional owner instruction: ${instruction}`, 1_000),
      ].slice(0, 30),
      acceptanceCriteria: [
        ...objective.acceptanceCriteria,
        bounded(instruction, 1_000),
      ].slice(0, 30),
      version: objective.version + 1,
      updatedAt: at,
    });
    if (!(await this.store.saveObjectiveIfVersion(updated, objective.version)))
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Objective changed while the instruction was attached.",
      );
    await this.store.saveTask(task);
    await this.event(
      updated,
      task.id,
      "TASK_CREATED",
      "Owner instruction added as a bounded child task.",
      { idempotencyKey },
    );
    return task;
  }

  /** Reuses the existing task worker, Agent OS session, matching, workspace, and validation path. */
  async createIntegrationRepairTask(
    context: ManagerContext,
    input: {
      objectiveId: string;
      integrationRunId: string;
      cycle: number;
      parentTaskId: string;
      category: string;
      summary: string;
      repairBaseCommit?: string;
      repairIntegrationWorkspaceId?: string;
    },
  ) {
    if (
      !/^[0-9a-f-]{36}$/i.test(input.integrationRunId) ||
      !Number.isInteger(input.cycle) ||
      input.cycle < 1 ||
      input.cycle > 3 ||
      input.summary.length < 1 ||
      input.summary.length > 1_000
      || (input.repairBaseCommit !== undefined && !/^[0-9a-f]{40,64}$/.test(input.repairBaseCommit))
      || Boolean(input.repairBaseCommit) !== Boolean(input.repairIntegrationWorkspaceId)
    )
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Repair task identity or evidence is invalid.",
      );
    const digest = createHash("sha256")
      .update(`${input.integrationRunId}:${input.cycle}`)
      .digest("hex");
    const taskId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const existing = await this.store.findTask(
      context.ownerId,
      context.companyId,
      taskId,
    );
    if (existing) {
      if (
        existing.objectiveId !== input.objectiveId ||
        existing.parentTaskId !== input.parentTaskId ||
        existing.repairBaseCommit !== (input.repairBaseCommit ?? null) ||
        existing.repairIntegrationWorkspaceId !== (input.repairIntegrationWorkspaceId ?? null)
      )
        throw new EngineeringOrchestrationError(
          "IDEMPOTENCY_CONFLICT",
          "Repair task identity is bound to another parent.",
        );
      return existing;
    }
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      input.objectiveId,
    );
    const parent = await this.store.findTask(
      context.ownerId,
      context.companyId,
      input.parentTaskId,
    );
    const repository = await this.runtimeStore.findRepository(
      context.ownerId,
      context.companyId,
      objective.repositoryId,
    );
    if (
      !repository ||
      repository.status !== "ACTIVE" ||
      !parent ||
      parent.objectiveId !== objective.id ||
      parent.repositoryId !== repository.id ||
      parent.status !== "COMPLETE" ||
      !["COMPLETED", "READY", "RUNNING"].includes(objective.status)
    )
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Repair requires a completed scoped parent task and active repository.",
      );
    const testingParent = parent.taskType === "TESTING";
    const taskType = testingParent ? ("INTEGRATION_PREP" as const)
      : parent.readOnly ? ("BACKEND" as const) : parent.taskType;
    const role = parent.readOnly || testingParent
      ? ("GENERALIST_ENGINEER" as const)
      : parent.assignedRole;
    const capabilities = [
      "repository.search",
      "repository.file_read",
      "repository.file_patch",
      "repository.file_create",
      "repository.validate",
    ] as EngineeringTask["requiredCapabilities"];
    const risk = parent.riskLevel;
    const agentId = await this.matchAgent(
      objective,
      role,
      parent.requiredSkills,
      capabilities,
      taskType,
      risk,
    );
    if (!agentId)
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "No repository-authorized repair agent is available.",
      );
    const reviewRequired = risk === "HIGH" || risk === "CRITICAL";
    const reviewerAgentId = reviewRequired
      ? await this.independentReviewer(objective, agentId)
      : null;
    if (reviewRequired && !reviewerAgentId)
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Independent repair review is unavailable.",
      );
    const at = this.now().toISOString();
    const task = EngineeringTaskSchema.parse({
      schemaVersion: "1",
      id: taskId,
      ownerId: objective.ownerId,
      companyId: objective.companyId,
      objectiveId: objective.id,
      parentTaskId: parent.id,
      repositoryId: repository.id,
      workspaceId: null,
      repairBaseCommit: input.repairBaseCommit ?? null,
      repairIntegrationWorkspaceId: input.repairIntegrationWorkspaceId ?? null,
      title: `Repair integration ${input.category.toLowerCase().replaceAll("_", " ")}`,
      description:
        `Fix only the smallest validated integration failure. ${input.summary}`.slice(
          0,
          4_000,
        ),
      acceptanceCriteria: objective.acceptanceCriteria.slice(0, 20),
      taskType,
      requiredSkills: parent.requiredSkills,
      requiredCapabilities: capabilities,
      dependencies: [],
      riskLevel: risk,
      estimatedDifficulty: parent.estimatedDifficulty,
      assignedAgentId: agentId,
      assignedRole: role,
      reviewerAgentId,
      modelPolicy: {
        initialTier: "TERRA",
        currentTier: "TERRA",
        maxTier: risk === "CRITICAL" ? "ASTRA" : "SOL",
        escalationCount: 0,
        reason:
          "Bounded integration repair through existing Engineering Manager policy.",
      },
      readOnly: false,
      reviewRequired,
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
    if (objective.status === "COMPLETED") {
      const reopened = EngineeringObjectiveSchema.parse({
        ...objective,
        status: "READY",
        completedAt: null,
        version: objective.version + 1,
        updatedAt: at,
      });
      if (!(await this.store.saveObjectiveIfVersion(reopened, objective.version)))
        throw new EngineeringOrchestrationError(
          "INVALID_STATE",
          "Objective changed while reserving repair task.",
        );
    }
    await this.store.saveTask(task);
    await this.event(
      objective,
      task.id,
      "TASK_CREATED",
      "Bounded integration repair task created.",
      {
        integrationRunId: input.integrationRunId,
        cycle: input.cycle,
        parentTaskId: parent.id,
        category: input.category,
      },
    );
    return task;
  }

  async create(context: ManagerContext, body: unknown) {
    const request = CreateEngineeringObjectiveRequestSchema.parse(body);
    const repository = await this.runtimeStore.findRepository(
      context.ownerId,
      context.companyId,
      request.repositoryId,
    );
    if (!repository || repository.status !== "ACTIVE")
      throw new EngineeringOrchestrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "The repository is not active in this company scope.",
      );
    const companyContext = {
      ownerId: context.ownerId,
      companyId: context.companyId,
      role: "OWNER" as const,
      requestId: context.requestId,
    };
    await companyScope.run(companyContext, () =>
      this.agents.ensureBuiltIns(context.ownerId, context.requestId),
    );
    const manager = await companyScope.run(companyContext, () =>
      this.agentStore.findAgent(context.ownerId, "engineering_manager"),
    );
    if (!manager || manager.status === "disabled")
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "The existing Engineering Manager agent is unavailable.",
      );
    const at = this.now().toISOString();
    const ambiguous = this.ambiguity(request.description, request.acceptanceCriteria);
    const objective = EngineeringObjectiveSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      workflowId: null,
      managerAgentId: manager.id,
      ...request,
      repositoryId: repository.id,
      status: ambiguous ? "NEEDS_CLARIFICATION" : "PLANNING",
      clarificationQuestion: ambiguous,
      clarification: ambiguous
        ? {
            id: crypto.randomUUID(),
            question: ambiguous,
            status: "PENDING",
            answerSummary: null,
            answerIdempotencyKey: null,
            requestedAt: at,
            answeredAt: null,
          }
        : null,
      maxReplans: 2,
      replanCount: 0,
      managerReasoningCount: ambiguous ? 1 : 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: "0.0",
      version: 1,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
    });
    await this.store.saveObjective(objective);
    if (ambiguous) {
      await this.event(objective, null, "OBJECTIVE_BLOCKED", ambiguous);
      await this.event(objective, null, "OWNER_CLARIFICATION_REQUIRED", ambiguous, {
        clarificationId: objective.clarification?.id,
      });
      await this.writeAudit(
        context,
        "ENGINEERING_OWNER_CLARIFICATION_REQUIRED",
        objective,
        {
          clarificationId: objective.clarification?.id,
        },
      );
      return this.view(context.ownerId, context.companyId, objective.id);
    }
    const tasks = await companyScope.run(companyContext, () =>
      this.decompose(objective, repository),
    );
    await this.store.saveTasks(tasks);
    const ready = await this.unlockReady(objective, tasks);
    const updated = EngineeringObjectiveSchema.parse({
      ...objective,
      status: "READY",
      managerReasoningCount: 1,
      updatedAt: this.now().toISOString(),
      version: objective.version + 1,
    });
    await this.store.saveObjective(updated);
    await this.event(
      updated,
      null,
      "OBJECTIVE_DECOMPOSED",
      "Bounded engineering task graph created.",
      {
        taskCount: ready.length,
        repoLanguages: repository.metadata.languages.slice(0, 10),
      },
    );
    for (const task of ready)
      await this.event(updated, task.id, "TASK_CREATED", task.title, {
        taskType: task.taskType,
        dependencies: task.dependencies,
      });
    await this.writeAudit(context, "ENGINEERING_OBJECTIVE_CREATED", updated, {
      taskCount: ready.length,
    });
    return this.view(context.ownerId, context.companyId, objective.id);
  }

  async runReady(context: ManagerContext, objectiveId: string, workerId: string) {
    for (let wave = 0; wave < 30; wave += 1) {
      let objective = await this.requireObjective(
        context.ownerId,
        context.companyId,
        objectiveId,
      );
      if (
        ["PAUSED", "CANCELLED", "COMPLETED", "FAILED", "NEEDS_CLARIFICATION"].includes(
          objective.status,
        )
      )
        break;
      let tasks = await this.store.listTasks(
        context.ownerId,
        context.companyId,
        objectiveId,
      );
      tasks = await this.unlockReady(objective, tasks);
      const activeCount = tasks.filter((task) => task.status === "ACTIVE").length;
      const slots = Math.max(0, objective.maxParallelTasks - activeCount);
      const candidates = tasks
        .filter((task) => task.status === "READY")
        .slice(0, slots);
      if (!candidates.length) {
        await this.refreshObjective(context, objective.id);
        break;
      }
      objective = EngineeringObjectiveSchema.parse({
        ...objective,
        status: "RUNNING",
        updatedAt: this.now().toISOString(),
        version: objective.version + 1,
      });
      await this.store.saveObjective(objective);
      await Promise.allSettled(
        candidates.map((task) =>
          this.executeTask(context, objective, task, `${workerId}:${wave}`),
        ),
      );
      await this.refreshObjective(context, objective.id);
    }
    return this.view(context.ownerId, context.companyId, objectiveId);
  }

  async pause(context: ManagerContext, objectiveId: string) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(objective.status))
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "The objective is terminal.",
      );
    await this.store.saveObjective(
      EngineeringObjectiveSchema.parse({
        ...objective,
        status: "PAUSED",
        version: objective.version + 1,
        updatedAt: this.now().toISOString(),
      }),
    );
    await this.event(
      objective,
      null,
      "OBJECTIVE_PAUSED",
      "New engineering tasks are paused.",
    );
    return this.view(context.ownerId, context.companyId, objectiveId);
  }

  async resume(context: ManagerContext, objectiveId: string) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (!["PAUSED", "BLOCKED"].includes(objective.status))
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Only paused or recoverable blocked objectives can resume.",
      );
    if (objective.status === "BLOCKED") {
      const tasks = await this.store.listTasks(
        context.ownerId,
        context.companyId,
        objective.id,
      );
      const results = await this.store.listResults(
        context.ownerId,
        context.companyId,
        objective.id,
      );
      let recoveredTask = false;
      for (const task of tasks) {
        // Older graphs assigned a second mutating test worktree from the clean
        // base. It cannot run feature tests against its completed predecessor's
        // unintegrated changes. Reuse real passing TEST evidence only when the
        // predecessor also changed a test file; integration still validates the
        // combined candidate and the failed QA worktree is never included.
        if (
          task.status === "BLOCKED" &&
          task.taskType === "TESTING" &&
          task.lastFailureCategory === "TEST_FAILURE" &&
          task.assignedAgentId &&
          task.dependencies.length > 0
        ) {
          const upstream = task.dependencies.map((id) => ({
            task: tasks.find((candidate) => candidate.id === id),
            result: results.find((candidate) => candidate.taskId === id),
          }));
          const validated = await Promise.all(
            upstream.map(async ({ task: parent, result }) => {
              if (
                parent?.status !== "COMPLETE" ||
                result?.status !== "SUCCEEDED" ||
                result.validationStatus !== "PASS" ||
                !result.validationReportId
              ) return false;
              const report = await this.runtimeStore.findValidation(
                context.ownerId,
                context.companyId,
                result.validationReportId,
              );
              return report?.status === "PASS" &&
                report.workspaceId === result.workspaceId &&
                report.steps.some((step) => step.kind === "TEST" && step.status === "PASS");
            }),
          );
          if (
            validated.every(Boolean) &&
            upstream.some(({ result }) =>
              result?.filesChanged.some((path) =>
                /(^|\/)(?:tests?\/|__tests__\/|[^/]+\.(?:test|spec)\.)/.test(path),
              ),
            )
          ) {
            const at = this.now().toISOString();
            await this.store.saveResult(EngineeringTaskResultSchema.parse({
              schemaVersion: "1",
              id: crypto.randomUUID(),
              ownerId: objective.ownerId,
              companyId: objective.companyId,
              objectiveId: objective.id,
              taskId: task.id,
              agentId: task.assignedAgentId,
              workspaceId: null,
              workspaceBaseCommit: null,
              filesChanged: [],
              diffSummary: "Passing registered test validation and focused test changes were supplied by completed dependency tasks.",
              validationStatus: "PASS",
              validationReportId: null,
              reviewStatus: "NOT_REQUIRED",
              modelProvider: null,
              modelName: null,
              modelTier: task.modelPolicy.currentTier,
              inputTokens: 0,
              outputTokens: 0,
              costUsd: "0.0",
              attempts: Math.max(1, task.attempt),
              durationMs: 0,
              status: "SUCCEEDED",
              failureCategory: null,
              warnings: ["Prior passing TEST reports reused; the combined candidate must pass validation and independent review."],
              completedAt: at,
            }));
            await this.store.saveTask(EngineeringTaskSchema.parse({
              ...task,
              workspaceId: null,
              readOnly: true,
              status: "COMPLETE",
              lastFailureCategory: null,
              lastFailureSummary: null,
              completedAt: at,
              updatedAt: at,
            }));
            await this.event(
              objective,
              task.id,
              "TASK_COMPLETED",
              "Redundant QA task closed using passing upstream test reports; combined integration validation remains required.",
            );
            recoveredTask = true;
            continue;
          }
        }
        const pendingWorkspace = await this.runtimeStore.findWorkspaceByIdempotencyKey(context.ownerId, context.companyId, task.repositoryId, task.id);
        if (
          task.status === "BLOCKED" &&
          (["MODEL_FAILURE", "ENVIRONMENT_FAILURE", "IMPLEMENTATION_ERROR"].includes(
            task.lastFailureCategory ?? "",
          ) || (pendingWorkspace && ["CREATING", "READY", "DIRTY"].includes(pendingWorkspace.state))) &&
          task.assignedAgentId
        ) {
          const boundAgentId = pendingWorkspace?.agentId;
          const recoveredAgentId = boundAgentId
            ? await this.matchAgent(objective, task.assignedRole, task.requiredSkills, task.requiredCapabilities, task.taskType, task.riskLevel, null, boundAgentId)
            : task.assignedAgentId;
          if (!recoveredAgentId) continue;
          const startsNewRecoveryCycle = task.attempt >= task.maxAttempts;
          await this.store.saveTask(
            EngineeringTaskSchema.parse({
              ...task,
              assignedAgentId: recoveredAgentId,
              status: "READY",
              attempt: startsNewRecoveryCycle ? 0 : task.attempt,
              maxAttempts: startsNewRecoveryCycle
                ? 3
                : Math.min(4, Math.max(task.maxAttempts, task.attempt + 1)),
              lastFailureCategory: null,
              lastFailureSummary: null,
              updatedAt: this.now().toISOString(),
            }),
          );
          recoveredTask = true;
          continue;
        }
        if (
          task.status !== "BLOCKED" ||
          task.lastFailureCategory !== "MISSING_CAPABILITY"
        )
          continue;
        const assignedAgentId = await this.matchAgent(
          objective,
          task.assignedRole,
          task.requiredSkills,
          task.requiredCapabilities,
          task.taskType,
          task.riskLevel,
          null,
          pendingWorkspace?.agentId ?? undefined,
        );
        if (!assignedAgentId) continue;
        await this.store.saveTask(
          EngineeringTaskSchema.parse({
            ...task,
            assignedAgentId,
            status: "READY",
            attempt: task.attempt >= task.maxAttempts ? 0 : task.attempt,
            maxAttempts: task.attempt >= task.maxAttempts ? 3 : Math.min(4, Math.max(task.maxAttempts, task.attempt + 1)),
            lastFailureCategory: null,
            lastFailureSummary: null,
            updatedAt: this.now().toISOString(),
          }),
        );
        recoveredTask = true;
      }
      if (!recoveredTask)
        throw new EngineeringOrchestrationError(
          "INVALID_STATE",
          tasks.some((task) => task.lastFailureCategory === "POLICY_DENIED")
            ? "This run is waiting for policy approval. Open Approvals and resolve the pending Engineering operation before retrying."
            : "No recoverable task or newly eligible authorized engineering agent is available.",
        );
      for (const task of tasks) {
        if (
          task.status !== "BLOCKED" ||
          task.lastFailureCategory !== "DEPENDENCY_NOT_READY"
        )
          continue;
        await this.store.saveTask(
          EngineeringTaskSchema.parse({
            ...task,
            status: "PLANNED",
            lastFailureCategory: null,
            lastFailureSummary: null,
            updatedAt: this.now().toISOString(),
          }),
        );
      }
    }
    await this.store.saveObjective(
      EngineeringObjectiveSchema.parse({
        ...objective,
        status: "READY",
        version: objective.version + 1,
        updatedAt: this.now().toISOString(),
      }),
    );
    await this.event(
      objective,
      null,
      "OBJECTIVE_RESUMED",
      "Scheduler reevaluation requested.",
    );
    return this.runReady(context, objectiveId, `resume-${objectiveId.slice(0, 8)}`);
  }

  async answerClarification(
    context: ManagerContext,
    objectiveId: string,
    clarificationId: string,
    body: unknown,
  ) {
    const answer = AnswerEngineeringClarificationRequestSchema.parse(body);
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const clarification = objective.clarification;
    if (!clarification || clarification.id !== clarificationId)
      throw new EngineeringOrchestrationError(
        "CLARIFICATION_NOT_FOUND",
        "The owner clarification was not found in this company scope.",
      );
    if (clarification.status === "ANSWERED") {
      if (
        clarification.answerIdempotencyKey === answer.idempotencyKey &&
        clarification.answerSummary === answer.answer
      )
        return this.view(context.ownerId, context.companyId, objective.id);
      throw new EngineeringOrchestrationError(
        "IDEMPOTENCY_CONFLICT",
        "The clarification was already answered with a different request identity.",
      );
    }
    if (
      clarification.status !== "PENDING" ||
      objective.status !== "NEEDS_CLARIFICATION"
    )
      throw new EngineeringOrchestrationError(
        "CLARIFICATION_STALE",
        "The clarification is stale or its objective is no longer resumable.",
      );
    const at = this.now().toISOString();
    const answered = EngineeringObjectiveSchema.parse({
      ...objective,
      constraints: [
        ...objective.constraints,
        bounded(`Owner clarification: ${answer.answer}`, 1_000),
      ].slice(0, 30),
      status: "PLANNING",
      clarificationQuestion: null,
      clarification: {
        ...clarification,
        status: "ANSWERED",
        answerSummary: answer.answer,
        answerIdempotencyKey: answer.idempotencyKey,
        answeredAt: at,
      },
      updatedAt: at,
      version: objective.version + 1,
    });
    if (!(await this.store.saveObjectiveIfVersion(answered, objective.version))) {
      const current = await this.requireObjective(
        context.ownerId,
        context.companyId,
        objective.id,
      );
      if (
        current.clarification?.answerIdempotencyKey === answer.idempotencyKey &&
        current.clarification.answerSummary === answer.answer
      )
        return this.view(context.ownerId, context.companyId, objective.id);
      throw new EngineeringOrchestrationError(
        "CLARIFICATION_STALE",
        "The clarification changed before this answer could be applied.",
      );
    }
    const repository = await this.runtimeStore.findRepository(
      context.ownerId,
      context.companyId,
      objective.repositoryId,
    );
    if (!repository || repository.status !== "ACTIVE")
      throw new EngineeringOrchestrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Repository authorization was lost before clarification resume.",
      );
    const tasks = await companyScope.run(
      {
        ownerId: context.ownerId,
        companyId: context.companyId,
        role: "OWNER" as const,
        requestId: context.requestId,
      },
      () => this.decompose(answered, repository),
    );
    await this.store.saveTasks(tasks);
    await this.unlockReady(answered, tasks);
    const ready = EngineeringObjectiveSchema.parse({
      ...answered,
      status: "READY",
      managerReasoningCount: answered.managerReasoningCount + 1,
      updatedAt: this.now().toISOString(),
      version: answered.version + 1,
    });
    await this.store.saveObjective(ready);
    await this.event(
      ready,
      null,
      "OWNER_CLARIFICATION_ANSWERED",
      "Owner clarification accepted; bounded scheduling resumed.",
      { clarificationId, idempotent: false },
    );
    await this.writeAudit(context, "ENGINEERING_OWNER_CLARIFICATION_ANSWERED", ready, {
      clarificationId,
    });
    return this.runReady(
      context,
      objective.id,
      `clarification-${clarificationId.slice(0, 8)}`,
    );
  }

  async cancel(context: ManagerContext, objectiveId: string) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const controllers = this.#active.get(objective.id);
    for (const controller of controllers?.values() ?? []) controller.abort();
    const tasks = await this.store.listTasks(
      context.ownerId,
      context.companyId,
      objective.id,
    );
    for (const task of tasks) {
      if (["COMPLETE", "FAILED", "CANCELLED"].includes(task.status)) continue;
      if (task.workspaceId)
        await this.workspaces.cancelExecutions({
          ownerId: context.ownerId,
          companyId: context.companyId,
          workspaceId: task.workspaceId,
          reason: "Objective cancelled; preserve workspace and diff.",
        });
      await this.store.saveTask(
        EngineeringTaskSchema.parse({
          ...task,
          status: "CANCELLED",
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        }),
      );
    }
    await this.store.saveObjective(
      EngineeringObjectiveSchema.parse({
        ...objective,
        status: "CANCELLED",
        clarification:
          objective.clarification?.status === "PENDING"
            ? { ...objective.clarification, status: "CANCELLED" }
            : objective.clarification,
        completedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        version: objective.version + 1,
      }),
    );
    await this.event(
      objective,
      null,
      "OBJECTIVE_CANCELLED",
      "Scheduling and eligible executions cancelled; workspaces preserved.",
    );
    return this.view(context.ownerId, context.companyId, objective.id);
  }

  async recover(context: ManagerContext, objectiveId: string) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const tasks = await this.store.listTasks(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const nowMs = this.now().getTime();
    for (const task of tasks) {
      if (
        task.status === "ACTIVE" &&
        task.leaseExpiresAt &&
        new Date(task.leaseExpiresAt).getTime() <= nowMs
      ) {
        await this.store.saveTask(
          EngineeringTaskSchema.parse({
            ...task,
            status: task.attempt < task.maxAttempts ? "READY" : "FAILED",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastFailureCategory: "ENVIRONMENT_FAILURE",
            lastFailureSummary:
              "Worker lease expired; workspace preserved and mutation was not replayed.",
            updatedAt: this.now().toISOString(),
          }),
        );
      }
    }
    await this.event(
      objective,
      null,
      "OBJECTIVE_RECOVERED",
      "Expired task leases reconciled without replaying mutations.",
    );
    return this.runReady(context, objectiveId, `recovery-${crypto.randomUUID()}`);
  }

  async replanBlockedTask(
    context: ManagerContext,
    objectiveId: string,
    taskId: string,
    replacementDescription: string,
  ) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (objective.replanCount >= objective.maxReplans)
      throw new EngineeringOrchestrationError(
        "REPLAN_LIMIT_REACHED",
        "The bounded replan limit was reached.",
      );
    const task = await this.store.findTask(context.ownerId, context.companyId, taskId);
    if (!task || task.objectiveId !== objective.id)
      throw new EngineeringOrchestrationError(
        "TASK_NOT_FOUND",
        "Engineering task not found.",
      );
    if (!["BLOCKED", "FAILED"].includes(task.status))
      throw new EngineeringOrchestrationError(
        "INVALID_STATE",
        "Only blocked or failed tasks may be replanned.",
      );
    await this.store.saveTask(
      EngineeringTaskSchema.parse({
        ...task,
        description: bounded(replacementDescription, 4_000),
        status: "READY",
        lastFailureCategory: null,
        lastFailureSummary: null,
        updatedAt: this.now().toISOString(),
      }),
    );
    await this.store.saveObjective(
      EngineeringObjectiveSchema.parse({
        ...objective,
        replanCount: objective.replanCount + 1,
        managerReasoningCount: objective.managerReasoningCount + 1,
        status: "READY",
        version: objective.version + 1,
        updatedAt: this.now().toISOString(),
      }),
    );
    return this.view(context.ownerId, context.companyId, objectiveId);
  }

  async view(ownerId: string, companyId: string, objectiveId: string) {
    const objective = await this.requireObjective(ownerId, companyId, objectiveId);
    const [tasks, results, artifacts, events] = await Promise.all([
      this.store.listTasks(ownerId, companyId, objectiveId),
      this.store.listResults(ownerId, companyId, objectiveId),
      this.store.listArtifacts(ownerId, companyId, objectiveId),
      this.store.listEvents(ownerId, companyId, objectiveId, 500),
    ]);
    return EngineeringObjectiveViewSchema.parse({
      objective,
      tasks,
      results,
      artifacts,
      events,
      readyForIntegration:
        objective.status === "COMPLETED" &&
        tasks.every((task) => task.status === "COMPLETE") &&
        results.every(
          (result) =>
            result.status === "SUCCEEDED" &&
            result.validationStatus === "PASS" &&
            ["NOT_REQUIRED", "PASS"].includes(result.reviewStatus) &&
            (!result.workspaceId || Boolean(result.workspaceBaseCommit)),
        ),
    });
  }

  list(ownerId: string, companyId: string, limit = 100) {
    return this.store.listObjectives(
      ownerId,
      companyId,
      Math.min(Math.max(limit, 1), 100),
    );
  }

  private async executeTask(
    context: ManagerContext,
    objective: EngineeringObjective,
    candidate: EngineeringTask,
    workerId: string,
  ) {
    const at = this.now();
    const claimed = await this.store.acquireTaskLease({
      ownerId: context.ownerId,
      companyId: context.companyId,
      taskId: candidate.id,
      workerId,
      now: at.toISOString(),
      expiresAt: new Date(at.getTime() + this.leaseMs).toISOString(),
    });
    if (!claimed) return;
    const generation = claimed.leaseGeneration;
    const controller = new AbortController();
    const renewEveryMs = Math.max(250, Math.floor(this.leaseMs / 3));
    const renewal = setInterval(() => {
      const renewedAt = this.now();
      void Promise.resolve(
        this.store.renewTaskLease({
          ownerId: context.ownerId,
          companyId: context.companyId,
          taskId: claimed.id,
          workerId,
          generation,
          now: renewedAt.toISOString(),
          expiresAt: new Date(renewedAt.getTime() + this.leaseMs).toISOString(),
        }),
      )
        .then((renewed) => {
          if (!renewed) controller.abort();
        })
        .catch(() => controller.abort());
    }, renewEveryMs);
    renewal.unref?.();
    const active = this.#active.get(objective.id) ?? new Map<string, AbortController>();
    active.set(claimed.id, controller);
    this.#active.set(objective.id, active);
    await this.event(objective, claimed.id, "TASK_STARTED", claimed.title, {
      attempt: claimed.attempt,
    });
    let task = claimed;
    try {
      if (!task.assignedAgentId)
        throw Object.assign(
          new Error("No eligible existing logical agent was available."),
          {
            category: "MISSING_CAPABILITY",
          },
        );
      const needsWorkspace =
        !task.readOnly ||
        task.requiredCapabilities.some(
          (capability) => capability !== "repository.inspect",
        );
      const existingWorkspace = task.workspaceId
        ? await this.runtimeStore.findWorkspace(context.ownerId, context.companyId, task.workspaceId)
        : undefined;
      if (existingWorkspace && existingWorkspace.agentId !== task.assignedAgentId)
        throw Object.assign(new Error("The task agent does not match its isolated workspace. Retry to revalidate the original authorized assignment."), { category: "POLICY_DENIED" });
      if (needsWorkspace && (!task.workspaceId || existingWorkspace?.state === "CREATING")) {
        const workspace = await this.workspaces.create({
          ownerId: context.ownerId,
          companyId: context.companyId,
          repositoryId: task.repositoryId,
          taskId: task.id,
          agentId: task.assignedAgentId,
          idempotencyKey: task.id,
          slug: task.taskType.toLowerCase().replaceAll("_", "-"),
          repairBaseCommit: task.repairBaseCommit,
          repairIntegrationWorkspaceId: task.repairIntegrationWorkspaceId,
          repairObjectiveId: task.repairBaseCommit ? task.objectiveId : null,
          transport: {
            sessionId: context.sessionId,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
            networkState: context.networkState,
            ...(context.deviceId ? { deviceId: context.deviceId } : {}),
          },
        });
        task = EngineeringTaskSchema.parse({
          ...task,
          workspaceId: workspace.id,
          updatedAt: this.now().toISOString(),
        });
        if (
          !(await this.store.saveTaskFenced(
            task,
            workerId,
            generation,
            this.now().toISOString(),
          ))
        )
          return;
        await this.event(
          objective,
          task.id,
          "WORKSPACE_ASSIGNED",
          "Isolated Phase 27.1 workspace assigned.",
          { workspaceId: workspace.id },
        );
      }
      if (task.workspaceId && !task.readOnly)
        await this.workspaces.prepare({
          ownerId: context.ownerId,
          companyId: context.companyId,
          repositoryId: task.repositoryId,
          workspaceId: task.workspaceId,
          taskId: task.id,
          agentId: task.assignedAgentId!,
          signal: controller.signal,
          transport: {
            sessionId: context.sessionId,
            requestId: context.requestId,
            ipAddress: context.ipAddress,
            networkState: context.networkState,
            ...(context.deviceId ? { deviceId: context.deviceId } : {}),
          },
        });
      const contextPackage = await this.contextFor(objective, task);
      const agentDefinitionId = await this.agentDefinitionId(
        objective,
        task.assignedAgentId!,
      );
      if (!agentDefinitionId)
        throw Object.assign(
          new Error("The assigned engineering agent definition is unavailable."),
          { category: "MISSING_CAPABILITY" },
        );
      if (this.agentOs) {
        const session = await this.agentOs.start({
          objective,
          task,
          specialistAgentId: task.assignedAgentId!,
          memoryRefs: contextPackage.memoryRefs,
          requestId: context.requestId,
        });
        task = EngineeringTaskSchema.parse({
          ...task,
          agentSessionId: session.sessionId,
          updatedAt: this.now().toISOString(),
        });
        if (
          !(await this.store.saveTaskFenced(
            task,
            workerId,
            generation,
            this.now().toISOString(),
          ))
        )
          return;
      }
      await this.event(
        objective,
        task.id,
        "MODEL_SELECTED",
        "AIRouter model policy selected for task execution.",
        {
          tier: task.modelPolicy.currentTier,
          reason: task.modelPolicy.reason,
        },
      );
      const started = Date.now();
      const outcome = await this.worker.execute({
        objective,
        task,
        agentDefinitionId,
        context: contextPackage,
        modelTier: task.modelPolicy.currentTier,
        workspaceId: task.workspaceId,
        signal: controller.signal,
        transport: {
          sessionId: context.sessionId,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          networkState: context.networkState,
          ...(context.deviceId ? { deviceId: context.deviceId } : {}),
        },
      });
      if (controller.signal.aborted) return;
      if (outcome.status !== "SUCCEEDED" || outcome.validationStatus !== "PASS") {
        const category =
          outcome.failureCategory ??
          (outcome.validationStatus === "FAIL"
            ? "TEST_FAILURE"
            : "IMPLEMENTATION_ERROR");
        await this.completeAgentSession(context, task, {
          summary: outcome.failureSummary ?? "Task execution did not pass validation.",
          confidence: 0,
          aiRequestId: outcome.aiRequestId ?? task.id,
          providerId: outcome.modelProvider ?? "unavailable",
          modelId: outcome.modelName ?? "unavailable",
          artifactCount: outcome.artifacts?.length ?? 0,
          sandboxStatus: "FAILED",
          errorCode: category,
        });
        await this.handleFailure(
          objective,
          task,
          workerId,
          generation,
          category,
          outcome.failureSummary ?? "Task execution did not pass validation.",
        );
        return;
      }
      if (!task.readOnly && !outcome.validationReportId) {
        await this.completeAgentSession(context, task, {
          summary:
            "A mutating task did not produce a persisted governed validation report.",
          confidence: 0,
          aiRequestId: outcome.aiRequestId ?? task.id,
          providerId: outcome.modelProvider ?? "unavailable",
          modelId: outcome.modelName ?? "unavailable",
          artifactCount: outcome.artifacts?.length ?? 0,
          sandboxStatus: "FAILED",
          errorCode: "TEST_FAILURE",
        });
        await this.handleFailure(
          objective,
          task,
          workerId,
          generation,
          "TEST_FAILURE",
          "A mutating task did not produce a persisted governed validation report.",
        );
        return;
      }
      if (!task.readOnly && !outcome.filesChanged?.length) {
        await this.completeAgentSession(context, task, {
          summary: "A mutating task reported no changed files.",
          confidence: 0,
          aiRequestId: outcome.aiRequestId ?? task.id,
          providerId: outcome.modelProvider ?? "unavailable",
          modelId: outcome.modelName ?? "unavailable",
          artifactCount: outcome.artifacts?.length ?? 0,
          sandboxStatus: "FAILED",
          errorCode: "IMPLEMENTATION_ERROR",
        });
        await this.handleFailure(
          objective,
          task,
          workerId,
          generation,
          "IMPLEMENTATION_ERROR",
          "A mutating task reported no changed files.",
        );
        return;
      }
      let reviewStatus: EngineeringTaskResult["reviewStatus"] = task.reviewRequired
        ? "PENDING"
        : "NOT_REQUIRED";
      if (task.reviewRequired) {
        if (!task.reviewerAgentId || task.reviewerAgentId === task.assignedAgentId) {
          await this.completeAgentSession(context, task, {
            summary: "An independent reviewer is required.",
            confidence: 0,
            aiRequestId: outcome.aiRequestId ?? task.id,
            providerId: outcome.modelProvider ?? "unavailable",
            modelId: outcome.modelName ?? "unavailable",
            artifactCount: outcome.artifacts?.length ?? 0,
            sandboxStatus: "FAILED",
            errorCode: "MISSING_CAPABILITY",
          });
          await this.handleFailure(
            objective,
            task,
            workerId,
            generation,
            "MISSING_CAPABILITY",
            "An independent reviewer is required.",
          );
          return;
        }
        task = EngineeringTaskSchema.parse({
          ...task,
          status: "REVIEWING",
          updatedAt: this.now().toISOString(),
        });
        if (
          !(await this.store.saveTaskFenced(
            task,
            workerId,
            generation,
            this.now().toISOString(),
          ))
        )
          return;
        await this.event(
          objective,
          task.id,
          "REVIEW_REQUESTED",
          "Independent review requested.",
          { reviewerAgentId: task.reviewerAgentId },
        );
        const authorAgentId = task.assignedAgentId;
        const reviewerAgentId = task.reviewerAgentId;
        if (!authorAgentId || !reviewerAgentId) return;
        const [authorAgentDefinitionId, reviewerAgentDefinitionId] = await Promise.all([
          this.agentDefinitionId(objective, authorAgentId),
          this.agentDefinitionId(objective, reviewerAgentId),
        ]);
        if (!authorAgentDefinitionId || !reviewerAgentDefinitionId) {
          await this.handleFailure(
            objective,
            task,
            workerId,
            generation,
            "MISSING_CAPABILITY",
            "An assigned engineering review agent definition is unavailable.",
          );
          return;
        }
        const review = await this.worker.review({
          objective,
          task,
          authorAgentId,
          reviewerAgentId,
          authorAgentDefinitionId,
          reviewerAgentDefinitionId,
          context: contextPackage,
          modelTier:
            task.riskLevel === "CRITICAL" ? "SOL" : task.modelPolicy.currentTier,
          workspaceId: task.workspaceId,
          signal: controller.signal,
        });
        reviewStatus = review.status;
        if (review.status !== "PASS") {
          await this.completeAgentSession(context, task, {
            summary: review.summary,
            confidence: 0,
            aiRequestId: outcome.aiRequestId ?? task.id,
            providerId: outcome.modelProvider ?? "unavailable",
            modelId: outcome.modelName ?? "unavailable",
            artifactCount: outcome.artifacts?.length ?? 0,
            sandboxStatus: "FAILED",
            errorCode: "IMPLEMENTATION_ERROR",
          });
          await this.handleFailure(
            objective,
            task,
            workerId,
            generation,
            "IMPLEMENTATION_ERROR",
            bounded(review.summary, 1_000),
          );
          return;
        }
      }
      for (const value of outcome.artifacts ?? [])
        await this.store.saveArtifact(
          EngineeringArtifactSchema.parse({
            id: crypto.randomUUID(),
            ownerId: objective.ownerId,
            companyId: objective.companyId,
            objectiveId: objective.id,
            taskId: task.id,
            type: value.type,
            title: value.title,
            summary: value.summary,
            contract: value.contract ?? {},
            producerAgentId: task.assignedAgentId,
            createdAt: this.now().toISOString(),
          }),
        );
      const repositoryWorkspace = task.workspaceId
        ? await this.runtimeStore.findWorkspace(
            objective.ownerId,
            objective.companyId,
            task.workspaceId,
          )
        : undefined;
      const result = EngineeringTaskResultSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        objectiveId: objective.id,
        taskId: task.id,
        agentId: task.assignedAgentId,
        workspaceId: task.workspaceId,
        workspaceBaseCommit: repositoryWorkspace?.baseCommit ?? null,
        filesChanged: outcome.filesChanged ?? [],
        diffSummary: outcome.diffSummary ?? "No diff summary supplied.",
        validationStatus: outcome.validationStatus,
        validationReportId: outcome.validationReportId ?? null,
        reviewStatus,
        modelProvider: outcome.modelProvider ?? null,
        modelName: outcome.modelName ?? null,
        modelTier: task.modelPolicy.currentTier,
        inputTokens: outcome.inputTokens ?? 0,
        outputTokens: outcome.outputTokens ?? 0,
        costUsd: outcome.costUsd ?? "0.0",
        attempts: task.attempt,
        durationMs: Date.now() - started,
        status: "SUCCEEDED",
        failureCategory: null,
        warnings: outcome.warnings ?? [],
        completedAt: this.now().toISOString(),
      });
      await this.completeAgentSession(context, task, {
        summary: result.diffSummary,
        confidence: 1,
        aiRequestId: outcome.aiRequestId ?? task.id,
        providerId: outcome.modelProvider ?? "unavailable",
        modelId: outcome.modelName ?? "unavailable",
        artifactCount: outcome.artifacts?.length ?? 0,
        sandboxStatus: "PASSED",
        errorCode: null,
      });
      await this.store.saveResult(result);
      const complete = EngineeringTaskSchema.parse({
        ...task,
        status: "COMPLETE",
        completedAt: result.completedAt,
        updatedAt: result.completedAt,
      });
      if (
        !(await this.store.saveTaskFenced(
          complete,
          workerId,
          generation,
          this.now().toISOString(),
        ))
      )
        return;
      if (this.memory && outcome.artifacts?.length)
        await companyScope.run(
          {
            ownerId: context.ownerId,
            companyId: context.companyId,
            role: "OWNER" as const,
            requestId: context.requestId,
          },
          () =>
            this.memory!.promote({
              ownerId: context.ownerId,
              companyId: context.companyId,
              repositoryId: objective.repositoryId,
              agentId: task.assignedAgentId!,
              taskId: task.id,
              resultId: result.id,
              artifacts: outcome.artifacts!,
              requestId: context.requestId,
              ipAddress: context.ipAddress,
            }),
        );
      await this.event(
        objective,
        task.id,
        "TASK_COMPLETED",
        "Task passed validation and required review.",
        {
          workspaceId: task.workspaceId,
          costUsd: result.costUsd,
        },
      );
    } catch (error) {
      const category = this.classify(error);
      await this.completeAgentSession(context, task, {
        summary:
          error instanceof Error
            ? bounded(error.message, 1_000)
            : "Unknown task failure.",
        confidence: 0,
        aiRequestId: task.id,
        providerId: "unavailable",
        modelId: "unavailable",
        artifactCount: 0,
        sandboxStatus: "FAILED",
        errorCode: category,
      }).catch(() => undefined);
      await this.handleFailure(
        objective,
        task,
        workerId,
        generation,
        category,
        error instanceof Error
          ? bounded(error.message, 1_000)
          : "Unknown task failure.",
      );
    } finally {
      clearInterval(renewal);
      active.delete(claimed.id);
      if (!active.size) this.#active.delete(objective.id);
      await this.store.releaseTaskLease({
        ownerId: context.ownerId,
        companyId: context.companyId,
        taskId: claimed.id,
        workerId,
        generation,
        now: this.now().toISOString(),
      });
    }
  }

  private async handleFailure(
    objective: EngineeringObjective,
    task: EngineeringTask,
    workerId: string,
    generation: number,
    category: EngineeringFailureCategory,
    summary: string,
  ) {
    const retry = !NON_RETRYABLE.has(category) && task.attempt < task.maxAttempts;
    const escalatedTier = retry && category !== "ENVIRONMENT_FAILURE" && category !== "DEPENDENCY_NOT_READY"
      ? this.escalate(task.modelPolicy.currentTier, task.riskLevel)
      : task.modelPolicy.currentTier;
    // A worktree is bound to its original agent; reassignment cannot transfer authority.
    const boundWorkspace = task.workspaceId
      ? await this.runtimeStore.findWorkspace(objective.ownerId, objective.companyId, task.workspaceId)
      : await this.runtimeStore.findWorkspaceByIdempotencyKey(objective.ownerId, objective.companyId, task.repositoryId, task.id);
    const reassign = retry && task.attempt >= 2 && !boundWorkspace;
    const agentId = reassign
      ? await this.matchAgent(
          objective,
          task.assignedRole,
          task.requiredSkills,
          task.requiredCapabilities,
          task.taskType,
          task.riskLevel,
          task.assignedAgentId,
        )
      : task.assignedAgentId;
    const next = EngineeringTaskSchema.parse({
      ...task,
      status: retry ? "READY" : "BLOCKED",
      assignedAgentId: agentId,
      modelPolicy: {
        ...task.modelPolicy,
        currentTier: escalatedTier,
        escalationCount:
          escalatedTier === task.modelPolicy.currentTier
            ? task.modelPolicy.escalationCount
            : task.modelPolicy.escalationCount + 1,
      },
      lastFailureCategory: category,
      lastFailureSummary: bounded(summary, 1_000),
      updatedAt: this.now().toISOString(),
    });
    if (
      !(await this.store.saveTaskFenced(
        next,
        workerId,
        generation,
        this.now().toISOString(),
      ))
    )
      return;
    await this.event(
      objective,
      task.id,
      category === "TEST_FAILURE"
        ? "VALIDATION_FAILED"
        : retry
          ? "TASK_RETRY"
          : "OBJECTIVE_BLOCKED",
      summary,
      {
        category,
        retry,
        attempt: task.attempt,
      },
    );
    if (escalatedTier !== task.modelPolicy.currentTier)
      await this.event(
        objective,
        task.id,
        "MODEL_ESCALATED",
        "Model tier escalated after a meaningful repeated failure.",
        {
          from: task.modelPolicy.currentTier,
          to: escalatedTier,
        },
      );
    if (reassign && agentId !== task.assignedAgentId)
      await this.event(
        objective,
        task.id,
        "TASK_REASSIGNED",
        "Task reassigned while retaining prior failure evidence.",
        { from: task.assignedAgentId, to: agentId },
      );
    if (category === "MISSING_CAPABILITY")
      await this.event(
        objective,
        task.id,
        "CAPABILITY_REQUESTED",
        "Capability request recorded for governance review; no capability was self-granted.",
      );
  }

  private async decompose(
    objective: EngineeringObjective,
    repository: NonNullable<
      Awaited<ReturnType<EngineeringRuntimeStore["findRepository"]>>
    >,
  ) {
    const text =
      `${objective.title} ${objective.description} ${objective.acceptanceCriteria.join(" ")}`.toLowerCase();
    const tinyEdit =
      objective.riskLevel !== "HIGH" &&
      objective.riskLevel !== "CRITICAL" &&
      /\b(change|rename|replace|adjust|increase|decrease|update)\b/.test(text) &&
      /\b(text|label|heading|button|cta|spacing|padding|margin|icon|color)\b/.test(
        text,
      ) &&
      !/\b(auth|permission|security|tenant|billing|payment|database|migration|dependency|delete|remove|rewrite)\b/.test(
        text,
      );
    const seeds: TaskSeed[] = tinyEdit
      ? [
          {
            key: "focused-edit",
            title: "Inspect and apply the focused project change",
            description: `Inspect the relevant code in ${repository.displayName}, apply only the requested small change, and run registered targeted validation.`,
            type: "FRONTEND",
            role: "GENERALIST_ENGINEER",
            dependencies: [],
            skills: ["frontend.implementation"],
            capabilities: [
              "repository.search",
              "repository.file_read",
              "repository.file_patch",
              "repository.validate",
            ],
          },
        ]
      : [
          {
            key: "architecture",
            title: "Inspect repository architecture and affected domains",
            description: `Create a bounded map of ${repository.displayName} and identify relevant existing patterns.`,
            type: "ARCHITECTURE",
            role: "GENERALIST_ENGINEER",
            dependencies: [],
            skills: ["repository.analysis", "architecture.analysis"],
            capabilities: ["repository.inspect"],
            readOnly: true,
          },
        ];
    if (!tinyEdit) {
      const implementationKeys: string[] = [];
      const add = (seed: TaskSeed) => {
        if (!seeds.some((value) => value.key === seed.key)) seeds.push(seed);
        if (
          !seed.readOnly &&
          !["TESTING", "DOCUMENTATION", "INTEGRATION_PREP"].includes(seed.type)
        )
          implementationKeys.push(seed.key);
      };
      const revertCommit = text.match(/governed revert commit ([0-9a-f]{40,64})/)?.[1];
      if (revertCommit)
        add({
          key: "revert",
          title: "Apply deterministic governed revert",
          description: `Revert exact current head ${revertCommit}. The target and expected head must both equal this registered commit; fail closed if history moved.`,
          type: "BACKEND",
          role: "GENERALIST_ENGINEER",
          dependencies: ["architecture"],
          skills: ["git.revert", "change.validation"],
          capabilities: ["repository.revert_commit", "repository.validate"],
          risk: "HIGH",
        });
      if (
        /\b(install (?:the )?dependencies|install [@a-z0-9._/-]+|(?:add|remove) (?:the )?(?:dependency|package|library|framer motion|recharts|lodash))\b/.test(
          text,
        )
      )
        add({
          key: "dependencies",
          title: "Apply the governed project dependency change",
          description:
            "Inspect the registered package manager, perform only the requested project-scoped dependency operation, and validate the resulting manifest and lockfile.",
          type: "BACKEND",
          role: "GENERALIST_ENGINEER",
          dependencies: ["architecture"],
          skills: ["dependency.management"],
          capabilities: [
            "repository.file_read",
            /\bremove\b/.test(text)
              ? "repository.remove_dependency"
              : /\binstall (?:the )?dependencies\b/.test(text)
                ? "repository.install_dependencies"
                : "repository.add_dependency",
            "repository.validate",
          ],
          risk: "MEDIUM",
        });
      if (/schema|database|migration|table|postgres|sql/.test(text))
        add({
          key: "database",
          title: "Implement database changes",
          description:
            "Implement bounded development/test schema changes and migration validation without production operations.",
          type: "DATABASE",
          role: "DATABASE_ENGINEER",
          dependencies: ["architecture"],
          skills: ["database.design", "migration.safety"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
          risk: "HIGH",
        });
      if (
        /api|endpoint|backend|server|service|preference|auth|billing|permission/.test(
          text,
        )
      )
        add({
          key: "backend",
          title: "Implement backend contract",
          description:
            "Implement the bounded backend behavior and publish its API contract artifact.",
          type: "BACKEND",
          role: "BACKEND_ENGINEER",
          dependencies: seeds.some((value) => value.key === "database")
            ? ["database"]
            : ["architecture"],
          skills: ["backend.implementation", "api.contract"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
        });
      if (/ui|frontend|web|component|page|screen/.test(text))
        add({
          key: "frontend",
          title: "Implement frontend behavior",
          description:
            "Implement the bounded UI using the structured backend contract when present.",
          type: "FRONTEND",
          role: "FRONTEND_ENGINEER",
          dependencies: seeds.some((value) => value.key === "backend")
            ? ["backend"]
            : ["architecture"],
          skills: ["frontend.implementation", "component.design"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
        });
      if (/android|mobile/.test(text))
        add({
          key: "mobile",
          title: "Implement mobile behavior",
          description:
            "Implement the bounded mobile change using registered Gradle validation only.",
          type: "ANDROID",
          role: "MOBILE_ENGINEER",
          dependencies: ["architecture"],
          skills: ["mobile.implementation"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
        });
      if (/mac|native|electron/.test(text))
        add({
          key: "mac",
          title: "Implement Mac/native behavior",
          description:
            "Implement the bounded registered Mac/native change without generic OS control.",
          type: "MAC_NATIVE",
          role: "MAC_NATIVE_ENGINEER",
          dependencies: ["architecture"],
          skills: ["mac.native"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
        });
      if (/infra|docker|pipeline|ci/.test(text))
        add({
          key: "infrastructure",
          title: "Implement development infrastructure change",
          description: "Implement reviewed non-production infrastructure changes only.",
          type: "INFRASTRUCTURE",
          role: "DEVOPS_INFRASTRUCTURE_ENGINEER",
          dependencies: ["architecture"],
          skills: ["infrastructure.review"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
          risk: "HIGH",
        });
      if (!implementationKeys.length)
        add({
          key: "implementation",
          title: "Implement bounded repository change",
          description: "Implement only the stated objective and acceptance criteria.",
          type: "BACKEND",
          role: "GENERALIST_ENGINEER",
          dependencies: ["architecture"],
          skills: ["implementation"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.file_patch",
            "repository.file_create",
            "repository.validate",
          ],
        });
      seeds.push({
        key: "testing",
        title: "Review focused test evidence",
        description:
          "Review the completed implementation tasks' focused test and validation evidence. Do not create a second test patch against the unintegrated base; combined integration validation remains authoritative.",
        type: "TESTING",
        role: "TEST_QA_ENGINEER",
        dependencies: [...implementationKeys],
        skills: ["test.plan", "failure.analysis"],
        capabilities: ["repository.search", "repository.file_read"],
        readOnly: true,
      });
      if (
        objective.riskLevel === "HIGH" ||
        objective.riskLevel === "CRITICAL" ||
        /auth|security|tenant|billing|payment|permission/.test(text)
      )
        seeds.push({
          key: "security",
          title: "Perform independent security review",
          description:
            "Review security, tenant, permission, and protected-path effects independently.",
          type: "SECURITY",
          role: "SECURITY_REVIEWER",
          dependencies: ["testing"],
          skills: ["threat.model", "permission.review"],
          capabilities: [
            "repository.search",
            "repository.file_read",
            "repository.git_diff",
          ],
          readOnly: true,
          risk: "HIGH",
        });
      seeds.push({
        key: "integration",
        title: "Prepare structured integration handoff",
        description:
          "Summarize workspaces, base commits, diffs, validation, reviews, and open risks for Phase 27.3.",
        type: "INTEGRATION_PREP",
        role: "GENERALIST_ENGINEER",
        dependencies: seeds.some((value) => value.key === "security")
          ? ["security"]
          : ["testing"],
        skills: ["integration.preparation"],
        capabilities: ["repository.git_status", "repository.git_diff"],
        readOnly: true,
      });
    }
    const limited = seeds.slice(0, 12);
    const idByKey = new Map(limited.map((seed) => [seed.key, crypto.randomUUID()]));
    const at = this.now().toISOString();
    return Promise.all(
      limited.map(async (seed, index) => {
        const risk = seed.risk ?? objective.riskLevel;
        const assignedAgentId = await this.matchAgent(
          objective,
          seed.role,
          seed.skills,
          seed.capabilities,
          seed.type,
          risk,
        );
        const reviewerAgentId =
          REVIEW_TASKS.has(seed.type) || risk === "CRITICAL"
            ? await this.independentReviewer(objective, assignedAgentId)
            : null;
        const initialTier = this.initialTier(seed.type, risk);
        return EngineeringTaskSchema.parse({
          schemaVersion: "1",
          id: idByKey.get(seed.key),
          ownerId: objective.ownerId,
          companyId: objective.companyId,
          objectiveId: objective.id,
          parentTaskId: null,
          repositoryId: objective.repositoryId,
          workspaceId: null,
          title: seed.title,
          description: seed.description,
          acceptanceCriteria: objective.acceptanceCriteria.slice(0, 20),
          taskType: seed.type,
          requiredSkills: seed.skills,
          requiredCapabilities: seed.capabilities,
          dependencies: seed.dependencies.flatMap((key) => {
            const id = idByKey.get(key);
            return id ? [id] : [];
          }),
          riskLevel: risk,
          estimatedDifficulty:
            risk === "CRITICAL"
              ? "VERY_HIGH"
              : risk === "HIGH"
                ? "HIGH"
                : index === 0
                  ? "MEDIUM"
                  : "LOW",
          assignedAgentId,
          assignedRole: seed.role,
          reviewerAgentId,
          modelPolicy: {
            initialTier,
            currentTier: initialTier,
            maxTier: risk === "CRITICAL" ? "ASTRA" : "SOL",
            escalationCount: 0,
            reason: this.modelReason(seed.type, risk),
          },
          readOnly: seed.readOnly ?? !MUTATING_TASKS.has(seed.type),
          reviewRequired: REVIEW_TASKS.has(seed.type) || risk === "CRITICAL",
          status: "PLANNED",
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
      }),
    );
  }

  private async unlockReady(objective: EngineeringObjective, tasks: EngineeringTask[]) {
    const complete = new Set(
      tasks.filter((task) => task.status === "COMPLETE").map((task) => task.id),
    );
    const failed = new Set(
      tasks
        .filter((task) => ["FAILED", "BLOCKED", "CANCELLED"].includes(task.status))
        .map((task) => task.id),
    );
    const updated: EngineeringTask[] = [];
    for (const task of tasks) {
      let next = task;
      if (
        task.status === "PLANNED" &&
        task.dependencies.every((id) => complete.has(id))
      )
        next = EngineeringTaskSchema.parse({
          ...task,
          status: "READY",
          updatedAt: this.now().toISOString(),
        });
      else if (
        task.status === "PLANNED" &&
        task.dependencies.some((id) => failed.has(id))
      )
        next = EngineeringTaskSchema.parse({
          ...task,
          status: "BLOCKED",
          lastFailureCategory: "DEPENDENCY_NOT_READY",
          lastFailureSummary: "A required predecessor did not complete.",
          updatedAt: this.now().toISOString(),
        });
      if (next !== task) await this.store.saveTask(next);
      updated.push(next);
    }
    return updated;
  }

  private async contextFor(objective: EngineeringObjective, task: EngineeringTask) {
    const repository = await this.runtimeStore.findRepository(
      objective.ownerId,
      objective.companyId,
      objective.repositoryId,
    );
    if (!repository)
      throw new EngineeringOrchestrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Repository scope was lost.",
      );
    const artifacts = (
      await this.store.listArtifacts(
        objective.ownerId,
        objective.companyId,
        objective.id,
      )
    )
      .filter((artifact) => task.dependencies.includes(artifact.taskId))
      .slice(0, 50);
    const memory =
      this.memory && task.assignedAgentId
        ? await companyScope.run(
            {
              ownerId: objective.ownerId,
              companyId: objective.companyId,
              role: "OWNER" as const,
              requestId: task.id,
            },
            () =>
              this.memory!.retrieve({
                ownerId: objective.ownerId,
                companyId: objective.companyId,
                repositoryId: objective.repositoryId,
                agentId: task.assignedAgentId!,
                taskId: task.id,
              }),
          )
        : { refs: [], summaries: [] };
    return EngineeringContextPackageSchema.parse({
      objectiveId: objective.id,
      taskId: task.id,
      repositorySummary: bounded(
        `${repository.displayName}; languages=${repository.metadata.languages.join(",")}; frameworks=${repository.metadata.frameworks.join(",")}; packageManagers=${repository.metadata.packageManagers.join(",")}; importantFiles=${repository.metadata.importantFiles.slice(0, 50).join(",")}`,
        4_000,
      ),
      relevantFiles: repository.metadata.importantFiles.slice(0, 50),
      dependencyArtifacts: artifacts,
      acceptanceCriteria: task.acceptanceCriteria,
      constraints: objective.constraints,
      protectedPaths: [
        ...new Set([...repository.protectedPaths, ...objective.protectedAreas]),
      ].slice(0, 100),
      priorFailureSummaries: task.lastFailureSummary ? [task.lastFailureSummary] : [],
      memoryRefs: memory.refs,
      memorySummaries: memory.summaries,
      maxTokens:
        task.estimatedDifficulty === "VERY_HIGH"
          ? 16_000
          : task.estimatedDifficulty === "HIGH"
            ? 12_000
            : 8_000,
    });
  }

  private async refreshObjective(context: ManagerContext, objectiveId: string) {
    const objective = await this.requireObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const [tasks, results] = await Promise.all([
      this.store.listTasks(context.ownerId, context.companyId, objectiveId),
      this.store.listResults(context.ownerId, context.companyId, objectiveId),
    ]);
    await this.unlockReady(objective, tasks);
    const refreshed = await this.store.listTasks(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    const allComplete =
      refreshed.length > 0 && refreshed.every((task) => task.status === "COMPLETE");
    const blocked = refreshed.some((task) =>
      ["BLOCKED", "FAILED"].includes(task.status),
    );
    const totalInputTokens = results.reduce(
      (sum, result) => sum + result.inputTokens,
      0,
    );
    const totalOutputTokens = results.reduce(
      (sum, result) => sum + result.outputTokens,
      0,
    );
    const totalCost = results.reduce((sum, result) => sum + Number(result.costUsd), 0);
    const updated = EngineeringObjectiveSchema.parse({
      ...objective,
      status: allComplete ? "COMPLETED" : blocked ? "BLOCKED" : "RUNNING",
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: money(totalCost),
      completedAt: allComplete ? this.now().toISOString() : null,
      updatedAt: this.now().toISOString(),
      version: objective.version + 1,
    });
    await this.store.saveObjective(updated);
    if (allComplete)
      await this.event(
        updated,
        null,
        "OBJECTIVE_COMPLETED",
        "All tasks passed validation and required independent review.",
      );
    else if (blocked)
      await this.event(
        updated,
        null,
        "OBJECTIVE_BLOCKED",
        "At least one task requires escalation, governance, or owner clarification.",
      );
  }

  private async matchAgent(
    objective: EngineeringObjective,
    role: EngineeringAgentRole,
    skills: string[],
    capabilities: EngineeringTask["requiredCapabilities"],
    taskType: EngineeringTaskType,
    riskLevel: EngineeringTask["riskLevel"],
    exclude?: string | null,
    requiredAssignmentId?: string,
  ) {
    const repository = await this.runtimeStore.findRepository(
      objective.ownerId,
      objective.companyId,
      objective.repositoryId,
    );
    const all = await companyScope.run(
      {
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        role: "OWNER" as const,
        requestId: objective.id,
      },
      () => this.agentStore.listAgents(objective.ownerId),
    );
    const eligible = (
      await Promise.all(
        all.map(async (agent) => ({
          agent,
          assignment: await this.agentStore.findAssignment(
            objective.ownerId,
            agent.id,
            objective.companyId,
          ),
        })),
      )
    ).filter(
      (candidate) =>
        candidate.assignment &&
        candidate.assignment.id !== exclude &&
        (!requiredAssignmentId || candidate.assignment.id === requiredAssignmentId) &&
        candidate.assignment.companyId === objective.companyId &&
        candidate.agent.status === "available" &&
        repository?.authorizedAgentIds.includes(candidate.assignment.id),
    );
    if (this.workforceMatcher && eligible.length) {
      const ranked = await this.workforceMatcher.rank({
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        objectiveId: objective.id,
        taskType,
        role,
        skills,
        capabilities,
        riskLevel,
        eligibleAgentDefinitionIds: eligible.map(({ agent }) => agent.id),
      });
      for (const definitionId of ranked) {
        const match = eligible.find(({ agent }) => agent.id === definitionId);
        if (match?.assignment) return match.assignment.id;
      }
    }
    const preferred = roleAgentPreference[role];
    return (
      eligible
        .map(({ agent, assignment }) => ({
          agent,
          assignment: assignment!,
          score:
            (preferred.includes(agent.id) ? 100 : 0) +
            skills.filter(
              (skill) =>
                agent.capabilities.includes(skill) ||
                agent.supportedTasks.includes(skill),
            ).length *
              10,
        }))
        .sort(
          (left, right) =>
            right.score - left.score || left.agent.id.localeCompare(right.agent.id),
        )[0]?.assignment.id ?? null
    );
  }

  private async agentDefinitionId(
    objective: EngineeringObjective,
    assignmentId: string,
  ) {
    const assignments = await companyScope.run(
      {
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        role: "OWNER" as const,
        requestId: objective.id,
      },
      () => this.agentStore.listAssignments(objective.ownerId, objective.companyId),
    );
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment || ["PAUSED", "REVOKED"].includes(assignment.status)) return null;
    return assignment.agentDefinitionId;
  }

  private async independentReviewer(
    objective: EngineeringObjective,
    authorId: string | null,
  ) {
    const repository = await this.runtimeStore.findRepository(
      objective.ownerId,
      objective.companyId,
      objective.repositoryId,
    );
    const agents = await companyScope.run(
      {
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        role: "OWNER" as const,
        requestId: objective.id,
      },
      () => this.agentStore.listAgents(objective.ownerId),
    );
    const eligible = (
      await Promise.all(
        agents.map(async (agent) => ({
          agent,
          assignment: await this.agentStore.findAssignment(
            objective.ownerId,
            agent.id,
            objective.companyId,
          ),
        })),
      )
    ).filter(
      (candidate) =>
        candidate.assignment &&
        candidate.assignment.id !== authorId &&
        candidate.assignment.companyId === objective.companyId &&
        candidate.agent.status === "available" &&
        repository?.authorizedAgentIds.includes(candidate.assignment.id),
    );
    return (
      eligible.find((candidate) => candidate.agent.id === "security_agent")?.assignment
        ?.id ??
      eligible.find((candidate) => candidate.agent.id === "review_agent")?.assignment
        ?.id ??
      null
    );
  }

  private initialTier(
    type: EngineeringTaskType,
    risk: EngineeringTask["riskLevel"],
  ): EngineeringModelTier {
    if (risk === "CRITICAL" || type === "SECURITY") return "SOL";
    if (
      risk === "HIGH" ||
      ["ARCHITECTURE", "DATABASE", "INFRASTRUCTURE"].includes(type)
    )
      return "TERRA";
    return "LUNA";
  }

  private modelReason(type: EngineeringTaskType, risk: EngineeringTask["riskLevel"]) {
    if (risk === "CRITICAL" || type === "SECURITY")
      return "Security-sensitive or critical work starts at Sol through AIRouter policy.";
    if (
      risk === "HIGH" ||
      ["ARCHITECTURE", "DATABASE", "INFRASTRUCTURE"].includes(type)
    )
      return "Complex or high-risk work starts at Terra through AIRouter policy.";
    return "Routine implementation and validation start cheap at Luna through AIRouter policy.";
  }

  private escalate(current: EngineeringModelTier, risk: EngineeringTask["riskLevel"]) {
    const maximum = risk === "CRITICAL" ? "ASTRA" : "SOL";
    const index = TIER_ORDER.indexOf(current);
    return TIER_ORDER[Math.min(index + 1, TIER_ORDER.indexOf(maximum))]!;
  }

  private ambiguity(description: string, criteria: string[]) {
    const text = `${description} ${criteria.join(" ")}`.toLowerCase();
    if (text.includes("[clarification required]"))
      return "A critical product requirement is explicitly unresolved. Please clarify it before implementation.";
    if (
      /delete (a |the )?user/.test(text) &&
      !/(retain|preserve|audit|history)/.test(text)
    )
      return "Should deleting a user preserve historical audit and activity records?";
    return null;
  }

  private classify(error: unknown): EngineeringFailureCategory {
    const value = error as { code?: string; category?: EngineeringFailureCategory };
    if (value.category) return value.category;
    if (value.code?.includes("POLICY") || value.code?.includes("DENIED") || value.code?.includes("APPROVAL"))
      return "POLICY_DENIED";
    if (value.code === "CAPABILITY_RESULT_INVALID") return "IMPLEMENTATION_ERROR";
    if (value.code?.includes("CAPABILITY")) return "MISSING_CAPABILITY";
    if (value.code === "DEPENDENCY_INSTALL_FAILED") return "ENVIRONMENT_FAILURE";
    if (value.code?.includes("TIMEOUT") || value.code?.includes("UNAVAILABLE"))
      return "ENVIRONMENT_FAILURE";
    return "IMPLEMENTATION_ERROR";
  }

  private async completeAgentSession(
    context: ManagerContext,
    task: EngineeringTask,
    outcome: {
      summary: string;
      confidence: number;
      aiRequestId: string;
      providerId: string;
      modelId: string;
      artifactCount: number;
      sandboxStatus: "PASSED" | "FAILED" | "UNAVAILABLE";
      errorCode: string | null;
    },
  ) {
    if (!this.agentOs || !task.agentSessionId) return;
    await this.agentOs.complete({
      ownerId: context.ownerId,
      sessionId: task.agentSessionId,
      outputSummary: bounded(outcome.summary, 4_000),
      confidence: outcome.confidence,
      aiRequestId: outcome.aiRequestId,
      providerId: bounded(outcome.providerId, 80),
      modelId: bounded(outcome.modelId, 160),
      artifactCount: outcome.artifactCount,
      sandboxStatus: outcome.sandboxStatus,
      errorCode: outcome.errorCode,
      requestId: context.requestId,
    });
  }

  private async requireObjective(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ) {
    const objective = await this.store.findObjective(ownerId, companyId, objectiveId);
    if (!objective)
      throw new EngineeringOrchestrationError(
        "OBJECTIVE_NOT_FOUND",
        "Engineering objective not found.",
      );
    return objective;
  }

  private async event(
    objective: EngineeringObjective,
    taskId: string | null,
    type: z.input<typeof EngineeringEventSchema>["type"],
    summary: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.store.saveEvent(
      EngineeringEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId: objective.ownerId,
        companyId: objective.companyId,
        objectiveId: objective.id,
        taskId,
        type,
        summary: bounded(summary, 1_000),
        metadata,
        createdAt: this.now().toISOString(),
      }),
    );
  }

  private writeAudit(
    context: ManagerContext,
    eventType:
      | "ENGINEERING_OBJECTIVE_CREATED"
      | "ENGINEERING_OWNER_CLARIFICATION_REQUIRED"
      | "ENGINEERING_OWNER_CLARIFICATION_ANSWERED",
    objective: EngineeringObjective,
    metadata: Record<string, unknown>,
  ) {
    return this.audit({
      eventType,
      ownerId: context.ownerId,
      companyId: context.companyId,
      ipAddress: context.ipAddress,
      outcome: "SUCCESS",
      reason: "Engineering Manager state transition recorded.",
      requestId: context.requestId,
      metadata: {
        objectiveId: objective.id,
        repositoryId: objective.repositoryId,
        ...metadata,
      },
    });
  }
}
