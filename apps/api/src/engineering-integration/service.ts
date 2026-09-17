import { createHash } from "node:crypto";

import {
  CreateEngineeringIntegrationRequestSchema,
  EngineeringCommitIntegrationResultSchema,
  EngineeringCandidateMergeResultSchema,
  EngineeringDiffResultSchema,
  EngineeringFileReadResultSchema,
  EngineeringGitStatusSchema,
  EngineeringIntegrationReviewSchema,
  EngineeringIntegrationRunSchema,
  EngineeringIntegrationViewSchema,
  EngineeringMergeCandidateSchema,
  MergeEngineeringCandidateRequestSchema,
  EngineeringPreparedCommitSchema,
  type EngineeringAcceptanceEvidenceSchema,
  type EngineeringCapability,
  type EngineeringChangeMapEntry,
  type EngineeringIntegrationReview,
  type EngineeringIntegrationConflict,
  type EngineeringIntegrationRun,
  type EngineeringTask,
  type EngineeringTaskResult,
  type NetworkVerificationState,
} from "@alexa-control/shared";
import type { z } from "zod";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApprovalService } from "../governance/approval-service.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { EngineeringWorkspaceGateway } from "../engineering-orchestration/service.js";
import type { EngineeringIntegrationStore } from "./store.js";
import { checkGeneratedContracts, classifyValidationRegressions } from "./evidence.js";
import { engineeringMergeAction } from "./merge-action.js";

type AcceptanceEvidence = z.infer<typeof EngineeringAcceptanceEvidenceSchema>;

export type EngineeringIntegrationContext = {
  ownerId: string;
  companyId: string;
  requestId: string;
  ipAddress: string;
  sessionId: string;
  networkState: NetworkVerificationState;
  deviceId?: string;
};

export class EngineeringIntegrationError extends Error {
  constructor(
    readonly code:
      | "INTEGRATION_NOT_FOUND"
      | "INTEGRATION_NOT_READY"
      | "INTEGRATION_BUSY"
      | "REPOSITORY_NOT_AUTHORIZED"
      | "COMMON_BASE_MISMATCH"
      | "STALE_CANDIDATE"
      | "LEASE_LOST"
      | "VALIDATION_FAILED"
      | "REVIEW_FAILED"
      | "CONFLICT_REQUIRES_OWNER"
      | "MERGE_APPROVAL_REQUIRED"
      | "MERGE_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "EngineeringIntegrationError";
  }

  get statusCode() {
    return this.code === "INTEGRATION_NOT_FOUND" ? 404 : 409;
  }
}

type Transport = EngineeringIntegrationContext;

export interface EngineeringIntegrationGateway extends EngineeringWorkspaceGateway {
  invoke(input: {
    ownerId: string;
    companyId: string;
    repositoryId: string;
    workspaceId: string | null;
    taskId: string;
    agentId: string;
    capability: EngineeringCapability;
    operationInput: Record<string, unknown>;
    signal: AbortSignal;
    transport: Pick<
      Transport,
      "sessionId" | "requestId" | "ipAddress" | "networkState" | "deviceId"
    >;
  }): Promise<{
    output: unknown;
    validationStatus?: "PASS" | "FAIL" | "ERROR" | "NOT_CONFIGURED";
    validationReportId?: string | null;
  }>;
}

export interface EngineeringIntegrationReviewer {
  review(input: {
    run: EngineeringIntegrationRun;
    headCommit: string;
    reviewerAgentId: string;
    security: boolean;
    taskResults: EngineeringTaskResult[];
    acceptanceCriteria: string[];
    filesChanged: string[];
    combinedPatch: string;
    signal: AbortSignal;
  }): Promise<
    Omit<
      EngineeringIntegrationReview,
      | "id"
      | "ownerId"
      | "companyId"
      | "runId"
      | "reviewerAgentId"
      | "headCommit"
      | "createdAt"
    >
  >;
}

export interface EngineeringIntegrationReviewerSelector {
  select(input: {
    ownerId: string;
    companyId: string;
    objectiveId: string;
    repositoryAgentIds: string[];
    excludedAgentIds: string[];
    security: boolean;
  }): Promise<string | undefined>;
}

export interface EngineeringIntegrationConflictResolver {
  propose(input: {
    ownerId: string;
    companyId: string;
    objectiveId: string;
    runId: string;
    resolverAgentId: string;
    path: string;
    existingContent: string;
    incomingContent: string;
    taskSummaries: string[];
    signal: AbortSignal;
  }): Promise<{
    decision: "RESOLVE_ADDITIVE" | "ESCALATE";
    confidence: number;
    summary: string;
    providerId: string | null;
    modelId: string | null;
    inputTokens?: number;
    outputTokens?: number;
    costUsd: string;
  }>;
}

export interface EngineeringIntegrationRepairManager {
  createIntegrationRepairTask(context: EngineeringIntegrationContext, input: {
    objectiveId: string;
    integrationRunId: string;
    cycle: number;
    parentTaskId: string;
    category: string;
    summary: string;
  }): Promise<EngineeringTask>;
}

export class UnavailableEngineeringIntegrationReviewer implements EngineeringIntegrationReviewer {
  review(): Promise<never> {
    return Promise.reject(
      Object.assign(
        new Error("Independent engineering integration review is unavailable."),
        {
          code: "REVIEW_UNAVAILABLE",
        },
      ),
    );
  }
}

const TASK_WEIGHT: Record<EngineeringTask["taskType"], number> = {
  DATABASE: 10,
  BACKEND: 20,
  FRONTEND: 30,
  ANDROID: 35,
  MAC_NATIVE: 35,
  DOCUMENTATION: 40,
  TESTING: 50,
  SECURITY: 60,
  INFRASTRUCTURE: 70,
  INTEGRATION_PREP: 80,
  ARCHITECTURE: 5,
};

const matchesPath = (path: string, patterns: string[]) =>
  patterns.some((pattern) => {
    const normalized = pattern.replace(/^\.\//, "").replace(/\*\*?$/, "");
    return (
      path === normalized ||
      path.startsWith(normalized.endsWith("/") ? normalized : `${normalized}/`)
    );
  });

const sensitivePath = (path: string) =>
  /(^|\/)(auth|authentication|permissions?|tenant|secrets?|credentials?|crypto|billing|payments?|governance|polic(?:y|ies)|approvals?|migrations?|infrastructure|deploy)(\/|\.|-)/i.test(
    path,
  ) ||
  /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|pyproject\.toml)$/.test(
    path,
  );

const latestSuccessfulResults = (
  tasks: EngineeringTask[],
  results: EngineeringTaskResult[],
) => {
  const byTask = new Map<string, EngineeringTaskResult>();
  for (const result of results
    .filter((item) => item.status === "SUCCEEDED")
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt)))
    byTask.set(result.taskId, result);
  return tasks.map((task) => byTask.get(task.id));
};

const deterministicOrder = (tasks: EngineeringTask[]) => {
  const remaining = new Map(tasks.map((task) => [task.id, task]));
  const completed = new Set<string>();
  const result: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((task) =>
        task.dependencies.every((id) => completed.has(id) || !remaining.has(id)),
      )
      .sort(
        (left, right) =>
          TASK_WEIGHT[left.taskType] - TASK_WEIGHT[right.taskType] ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
    if (ready.length === 0)
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Task dependency graph is cyclic.",
      );
    for (const task of ready) {
      result.push(task.id);
      completed.add(task.id);
      remaining.delete(task.id);
    }
  }
  return result;
};

export class EngineeringIntegrationService {
  private reviewerSelector?: EngineeringIntegrationReviewerSelector;
  private conflictResolver?: EngineeringIntegrationConflictResolver;
  private approvals?: ApprovalService;
  private manager?: EngineeringIntegrationRepairManager;
  private readonly active = new Map<string, AbortController>();

  constructor(
    readonly store: EngineeringIntegrationStore,
    readonly orchestration: EngineeringOrchestrationStore,
    readonly runtime: EngineeringRuntimeStore,
    readonly gateway: EngineeringIntegrationGateway,
    readonly reviewer: EngineeringIntegrationReviewer,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly leaseMs = 120_000,
  ) {}

  setReviewerSelector(selector: EngineeringIntegrationReviewerSelector) {
    this.reviewerSelector = selector;
  }

  setApprovals(approvals: ApprovalService) {
    this.approvals = approvals;
  }

  setConflictResolver(resolver: EngineeringIntegrationConflictResolver) {
    this.conflictResolver = resolver;
  }

  setManager(manager: EngineeringIntegrationRepairManager) {
    this.manager = manager;
  }

  async merge(context: EngineeringIntegrationContext, runId: string, body: unknown) {
    const { idempotencyKey } = MergeEngineeringCandidateRequestSchema.parse(body);
    const initial = await this.view(context.ownerId, context.companyId, runId);
    const candidate = initial.candidate;
    if (!candidate || initial.run.status !== "READY")
      throw new EngineeringIntegrationError("MERGE_DENIED", "A READY integration candidate is required.");
    if (candidate.status === "MERGED") {
      if (candidate.mergeIdempotencyKey === idempotencyKey) return initial;
      throw new EngineeringIntegrationError("MERGE_DENIED", "Candidate was merged under a different request identity.");
    }
    if (!["READY", "MERGING"].includes(candidate.status) ||
        candidate.mergeIdempotencyKey && candidate.mergeIdempotencyKey !== idempotencyKey)
      throw new EngineeringIntegrationError("MERGE_DENIED", "Candidate is not mergeable under this request identity.");
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, candidate.repositoryId);
    if (!repository || repository.status !== "ACTIVE" ||
        !repository.protectedBranches.includes(repository.defaultBranch))
      throw new EngineeringIntegrationError("REPOSITORY_NOT_AUTHORIZED", "Registered protected target branch is unavailable.");
    if (!this.approvals)
      throw new EngineeringIntegrationError("MERGE_DENIED", "Canonical approval service is unavailable.");
    const action = engineeringMergeAction(candidate, repository.workspaceLocatorId, repository.defaultBranch, idempotencyKey);
    const approval = await this.approvals.findMatchingApproved(context.ownerId, action);
    if (!approval || approval.status !== "APPROVED") {
      const pending = await this.approvals.create({
        ownerId: context.ownerId,
        action,
        riskLevel: "high",
        approvalRequirement: "recent_authentication",
        ipAddress: context.ipAddress,
        requestId: context.requestId,
      });
      throw new EngineeringIntegrationError("MERGE_APPROVAL_REQUIRED", `Recent-authentication approval ${pending.id} is required before merge.`);
    }
    if (approval.decidedBySessionId !== context.sessionId)
      throw new EngineeringIntegrationError("MERGE_DENIED", "Merge approval belongs to a different authenticated session.");
    const workerId = `merge:${context.requestId}`;
    const at = this.now();
    const claimed = await this.store.acquireReadyLease({
      ownerId: context.ownerId,
      companyId: context.companyId,
      runId,
      workerId,
      now: at.toISOString(),
      expiresAt: new Date(at.getTime() + this.leaseMs).toISOString(),
    });
    if (!claimed) throw new EngineeringIntegrationError("INTEGRATION_BUSY", "Candidate merge lease is unavailable.");
    const generation = claimed.leaseGeneration;
    const controller = new AbortController();
    let dispatched = false;
    let confirmed = false;
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing || controller.signal.aborted) return;
      renewing = true;
      void this.renew(claimed, workerId, generation)
        .catch(() => controller.abort())
        .finally(() => { renewing = false; });
    }, Math.max(250, Math.floor(this.leaseMs / 3)));
    try {
      const current = await this.view(context.ownerId, context.companyId, runId);
      const liveCandidate = current.candidate;
      if (!liveCandidate || liveCandidate.id !== candidate.id ||
          !["READY", "MERGING"].includes(liveCandidate.status) ||
          liveCandidate.headCommit !== liveCandidate.validatedHeadCommit ||
          liveCandidate.headCommit !== liveCandidate.reviewedHeadCommit ||
          liveCandidate.validationReportId !== claimed.validationReportId ||
          liveCandidate.reviewReportId !== claimed.reviewId ||
          liveCandidate.securityReviewId !== claimed.securityReviewId)
        throw new EngineeringIntegrationError("MERGE_DENIED", "Candidate evidence changed before merge.");
      const [validation, reviews] = await Promise.all([
        this.runtime.findValidation(context.ownerId, context.companyId, liveCandidate.validationReportId),
        this.store.listReviews(context.ownerId, context.companyId, runId),
      ]);
      const passing = (id: string) => reviews.some((review) => review.id === id &&
        review.headCommit === liveCandidate.headCommit &&
        ["PASS", "PASS_WITH_WARNINGS"].includes(review.verdict));
      if (validation?.status !== "PASS" ||
          validation.workspaceId !== liveCandidate.integrationWorkspaceId ||
          !passing(liveCandidate.reviewReportId) ||
          claimed.securityReviewRequired && (!liveCandidate.securityReviewId || !passing(liveCandidate.securityReviewId)))
        throw new EngineeringIntegrationError("MERGE_DENIED", "Current validation or required independent review is not passing.");
      const authorIds = new Set((await this.orchestration.listResults(context.ownerId, context.companyId, claimed.objectiveId))
        .filter((result) => claimed.taskIds.includes(result.taskId)).map((result) => result.agentId));
      if (reviews.some((review) =>
        [liveCandidate.reviewReportId, liveCandidate.securityReviewId].includes(review.id) && authorIds.has(review.reviewerAgentId)))
        throw new EngineeringIntegrationError("MERGE_DENIED", "Authoring engineering identity cannot provide sole review authority.");
      const agentId = repository.authorizedAgentIds.find((id) => !authorIds.has(id)) ?? repository.authorizedAgentIds[0];
      if (!agentId)
        throw new EngineeringIntegrationError("REPOSITORY_NOT_AUTHORIZED", "No repository-authorized merge agent identity is available.");
      await this.assertHead(context, claimed, agentId, liveCandidate.headCommit, controller.signal);
      const inspected = await this.gateway.invoke({
        ownerId: context.ownerId, companyId: context.companyId, repositoryId: repository.id,
        workspaceId: null, taskId: claimed.objectiveId, agentId,
        capability: "repository.inspect", operationInput: {}, signal: controller.signal, transport: context,
      });
      const target = inspected.output as { baseCommit?: unknown; branch?: unknown; dirty?: unknown };
      if (target.branch !== repository.defaultBranch || target.dirty !== false ||
          target.baseCommit !== liveCandidate.baseCommit && target.baseCommit !== liveCandidate.headCommit)
      {
        await this.store.saveCandidateFenced(EngineeringMergeCandidateSchema.parse({
          ...liveCandidate, status: "STALE", updatedAt: this.now().toISOString(),
        }), workerId, generation, this.now().toISOString());
        throw new EngineeringIntegrationError("STALE_CANDIDATE", "Protected target advanced or became dirty; reintegration is required.");
      }
      const reserved = EngineeringMergeCandidateSchema.parse({
        ...liveCandidate, status: "MERGING", mergeIdempotencyKey: idempotencyKey,
        updatedAt: this.now().toISOString(),
      });
      if (!await this.store.saveCandidateFenced(reserved, workerId, generation, this.now().toISOString()))
        throw new EngineeringIntegrationError("LEASE_LOST", "Merge reservation lost the lease fence.");
      dispatched = true;
      const merged = EngineeringCandidateMergeResultSchema.parse((await this.gateway.invoke({
        ownerId: context.ownerId, companyId: context.companyId, repositoryId: repository.id,
        workspaceId: claimed.integrationWorkspaceId, taskId: claimed.objectiveId, agentId,
        capability: "repository.merge_candidate",
        operationInput: {
          candidateId: candidate.id, integrationRunId: runId,
          expectedBase: candidate.baseCommit, candidateHead: candidate.headCommit,
          targetBranch: repository.defaultBranch, mergeIdempotencyKey: idempotencyKey,
          leaseGeneration: generation, leaseExpiresAt: claimed.leaseExpiresAt!,
        },
        signal: controller.signal, transport: context,
      })).output);
      if (!merged.merged || merged.headCommit !== candidate.headCommit || merged.targetBranch !== repository.defaultBranch || controller.signal.aborted)
        throw new EngineeringIntegrationError("MERGE_DENIED", "Signed merge result did not confirm the reviewed candidate head.");
      if (!await this.store.saveCandidateFenced(EngineeringMergeCandidateSchema.parse({
        ...reserved, status: "MERGED", mergedAt: this.now().toISOString(),
        mergedHeadCommit: merged.headCommit, updatedAt: this.now().toISOString(),
      }), workerId, generation, this.now().toISOString()))
        throw new EngineeringIntegrationError("LEASE_LOST", "Merged target requires same-key recovery after lease loss.");
      confirmed = true;
      await this.auditEvent(context, "ENGINEERING_MERGE_EXECUTED", "Governed candidate fast-forward merge completed.", {
        integrationRunId: runId, mergeCandidateId: candidate.id, headCommit: merged.headCommit,
        alreadyMerged: merged.alreadyMerged,
      });
      return this.view(context.ownerId, context.companyId, runId);
    } finally {
      clearInterval(heartbeat);
      if (!dispatched || confirmed) await this.store.releaseLease({
        ownerId: context.ownerId, companyId: context.companyId, runId,
        workerId, generation, now: this.now().toISOString(),
      });
    }
  }

  async create(context: EngineeringIntegrationContext, body: unknown) {
    const request = CreateEngineeringIntegrationRequestSchema.parse(body);
    const existing = await this.store.findRunByIdempotency(
      context.ownerId,
      context.companyId,
      (await this.requireObjective(context, request.objectiveId)).repositoryId,
      request.idempotencyKey,
    );
    if (existing) return this.view(context.ownerId, context.companyId, existing.id);

    const objective = await this.requireObjective(context, request.objectiveId);
    const [repository, tasks, allResults] = await Promise.all([
      this.runtime.findRepository(
        context.ownerId,
        context.companyId,
        objective.repositoryId,
      ),
      this.orchestration.listTasks(context.ownerId, context.companyId, objective.id),
      this.orchestration.listResults(context.ownerId, context.companyId, objective.id),
    ]);
    if (!repository || repository.status !== "ACTIVE")
      throw new EngineeringIntegrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Repository is not active in this company scope.",
      );
    if (
      objective.status !== "COMPLETED" ||
      tasks.length === 0 ||
      tasks.some((task) => task.status !== "COMPLETE")
    )
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Objective tasks are not complete.",
      );
    const results = latestSuccessfulResults(tasks, allResults);
    if (results.some((result) => !result))
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Every task requires a successful result.",
      );
    const selected = results as EngineeringTaskResult[];
    if (
      selected.some(
        (result) =>
          result.validationStatus !== "PASS" ||
          !["NOT_REQUIRED", "PASS"].includes(result.reviewStatus),
      )
    )
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Task validation or required review is incomplete.",
      );
    const mutating = selected.filter(
      (result) => result.workspaceId && result.filesChanged.length > 0,
    );
    if (mutating.length === 0)
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "No completed task produced an integratable repository change.",
      );
    const bases = new Set(mutating.map((result) => result.workspaceBaseCommit));
    if (bases.size !== 1 || bases.has(null))
      throw new EngineeringIntegrationError(
        "COMMON_BASE_MISMATCH",
        "Task workspaces do not share one trusted base commit.",
      );
    const baseCommit = mutating[0]!.workspaceBaseCommit!;
    const kinds = new Map<
      string,
      Map<string, EngineeringChangeMapEntry["kinds"][number]>
    >();
    for (const result of mutating) {
      const workspace = await this.runtime.findWorkspace(
        context.ownerId,
        context.companyId,
        result.workspaceId!,
      );
      const task = tasks.find((item) => item.id === result.taskId);
      if (
        !workspace ||
        !task ||
        workspace.repositoryId !== repository.id ||
        workspace.taskId !== result.taskId ||
        workspace.agentId !== result.agentId ||
        task.assignedAgentId !== result.agentId ||
        !repository.authorizedAgentIds.includes(result.agentId) ||
        workspace.baseCommit !== baseCommit
      )
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "A source workspace is missing or outside task scope.",
        );
      const status = EngineeringGitStatusSchema.parse(
        (
          await this.gateway.invoke({
            ownerId: context.ownerId,
            companyId: context.companyId,
            repositoryId: repository.id,
            workspaceId: workspace.id,
            taskId: result.taskId,
            agentId: result.agentId,
            capability: "repository.git_status",
            operationInput: {},
            signal: new AbortController().signal,
            transport: context,
          })
        ).output,
      );
      if (
        !status.dirty ||
        status.truncated ||
        status.branch !== workspace.branchName ||
        status.entries.some((entry) => entry.kind === "CONFLICTED") ||
        JSON.stringify(status.entries.map((entry) => entry.path).sort()) !==
          JSON.stringify([...result.filesChanged].sort())
      )
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "Source workspace changes differ from the completed task result.",
        );
      for (const entry of status.entries) {
        if (entry.kind === "CONFLICTED")
          throw new EngineeringIntegrationError(
            "INTEGRATION_NOT_READY",
            "Unresolved source conflict cannot be integrated.",
          );
        const kind = entry.kind === "UNTRACKED" ? "ADDED" : entry.kind;
        const byTask =
          kinds.get(entry.path) ??
          new Map<string, EngineeringChangeMapEntry["kinds"][number]>();
        byTask.set(result.taskId, kind);
        kinds.set(entry.path, byTask);
      }
    }
    const agentId = mutating
      .map((result) => result.agentId)
      .find((id) => repository.authorizedAgentIds.includes(id));
    if (!agentId)
      throw new EngineeringIntegrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "No completed task agent remains authorized for integration.",
      );
    const workspace = await this.gateway.create({
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      taskId: objective.id,
      agentId,
      idempotencyKey: `integration-${createHash("sha256").update(request.idempotencyKey).digest("hex")}`,
      slug: "integration",
      transport: context,
    });
    if (workspace.baseCommit !== baseCommit)
      throw new EngineeringIntegrationError(
        "STALE_CANDIDATE",
        "Repository base moved before the integration worktree was created.",
      );
    const storedWorkspace = await this.runtime.findWorkspace(
      context.ownerId,
      context.companyId,
      workspace.id,
    );
    if (!storedWorkspace)
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Integration workspace was not persisted.",
      );
    const at = this.now().toISOString();
    const changeMap = this.changeMap(
      mutating,
      kinds,
      repository.protectedPaths,
      repository.generatedPaths,
    );
    const run = EngineeringIntegrationRunSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      objectiveId: objective.id,
      idempotencyKey: request.idempotencyKey,
      baseCommit,
      integrationBranch: storedWorkspace.branchName,
      integrationWorkspaceId: workspace.id,
      taskIds: mutating.map((result) => result.taskId),
      sourceWorkspaceIds: mutating.map((result) => result.workspaceId!),
      integrationOrder: deterministicOrder(tasks).filter((id) =>
        mutating.some((result) => result.taskId === id),
      ),
      changeMap,
      contractFindings: checkGeneratedContracts(changeMap, repository.metadata.contractBindings),
      regressionEvidence: [],
      conflicts: [],
      status: "PLANNING",
      securityReviewRequired:
        objective.riskLevel === "HIGH" ||
        objective.riskLevel === "CRITICAL" ||
        tasks.some((task) => task.taskType === "SECURITY") ||
        mutating.some((result) =>
          result.filesChanged.some(
            (path) =>
              matchesPath(path, repository.protectedPaths) || sensitivePath(path),
          ),
        ),
      validationReportId: null,
      baselineValidationReportId: null,
      reviewId: null,
      securityReviewId: null,
      repairCycles: 0,
      maxRepairCycles: Math.max(1, Math.min(3, objective.maxReplans + 1)),
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseGeneration: 0,
      integrationDurationMs: 0,
      validationDurationMs: 0,
      reviewDurationMs: 0,
      integrationCostUsd: "0.0",
      reviewCostUsd: "0.0",
      securityReviewCostUsd: "0.0",
      repairCostUsd: "0.0",
      createdAt: at,
      startedAt: null,
      completedAt: null,
      updatedAt: at,
    });
    await this.store.saveRun(run);
    await this.auditEvent(
      context,
      "ENGINEERING_INTEGRATION_CREATED",
      "Engineering integration run created.",
      {
        integrationRunId: run.id,
        objectiveId: objective.id,
        repositoryId: repository.id,
        taskCount: run.taskIds.length,
      },
    );
    return this.view(context.ownerId, context.companyId, run.id);
  }

  async execute(
    context: EngineeringIntegrationContext,
    runId: string,
    workerId: string,
  ) {
    const claimedAt = this.now();
    const claimed = await this.store.acquireLease({
      ownerId: context.ownerId,
      companyId: context.companyId,
      runId,
      workerId,
      now: claimedAt.toISOString(),
      expiresAt: new Date(claimedAt.getTime() + this.leaseMs).toISOString(),
    });
    if (!claimed)
      throw new EngineeringIntegrationError(
        "INTEGRATION_BUSY",
        "Integration run is complete, cancelled, or leased.",
      );
    let run: EngineeringIntegrationRun = claimed;
    const generation = run.leaseGeneration;
    const started = this.now().getTime();
    const controller = new AbortController();
    this.active.set(run.id, controller);
    let renewing = false;
    const heartbeat = setInterval(
      () => {
        if (renewing || controller.signal.aborted) return;
        renewing = true;
        void this.renew(run, workerId, generation)
          .catch(() => controller.abort())
          .finally(() => {
            renewing = false;
          });
      },
      Math.max(250, Math.floor(this.leaseMs / 3)),
    );
    try {
      const [objective, tasks, allResults] = await Promise.all([
        this.requireObjective(context, run.objectiveId),
        this.orchestration.listTasks(
          context.ownerId,
          context.companyId,
          run.objectiveId,
        ),
        this.orchestration.listResults(
          context.ownerId,
          context.companyId,
          run.objectiveId,
        ),
      ]);
      const selected = latestSuccessfulResults(tasks, allResults).filter(
        (value): value is EngineeringTaskResult => Boolean(value),
      );
      if (claimed.status === "REPAIRING") {
        const pendingId = run.repairTaskIds.find((id) => !run.taskIds.includes(id));
        const pendingTask = tasks.find((task) => task.id === pendingId);
        const pendingResult = selected.find((result) => result.taskId === pendingId);
        if (pendingId && (!pendingTask || ["FAILED", "BLOCKED", "CANCELLED"].includes(pendingTask.status))) {
          run = await this.saveFenced({ ...run, status: "BLOCKED", completedAt: this.now().toISOString(),
            updatedAt: this.now().toISOString() }, workerId, generation);
          return this.view(context.ownerId, context.companyId, run.id);
        }
        if (pendingId && (objective.status !== "COMPLETED" || pendingTask?.status !== "COMPLETE" ||
            !pendingResult || pendingResult.validationStatus !== "PASS" ||
            !["PASS", "NOT_REQUIRED"].includes(pendingResult.reviewStatus) ||
            !pendingResult.workspaceId || !pendingResult.filesChanged.length))
          return this.view(context.ownerId, context.companyId, run.id);
        if (pendingId && pendingResult && pendingTask) {
          const workspace = await this.runtime.findWorkspace(context.ownerId, context.companyId, pendingResult.workspaceId!);
          const repository = await this.runtime.findRepository(context.ownerId, context.companyId, run.repositoryId);
          if (!workspace || !repository || workspace.baseCommit !== run.baseCommit ||
              workspace.taskId !== pendingTask.id || workspace.agentId !== pendingResult.agentId ||
              !repository.authorizedAgentIds.includes(pendingResult.agentId))
            throw new EngineeringIntegrationError("INTEGRATION_NOT_READY", "Repair workspace lost its registered common-base scope.");
          const updatedMap = [...run.changeMap];
          for (const path of pendingResult.filesChanged) {
            const prior = updatedMap.find((entry) => entry.path === path);
            if (prior) {
              updatedMap[updatedMap.indexOf(prior)] = {
                ...prior, taskIds: [...new Set([...prior.taskIds, pendingId])],
                overlap: "SAME_FILE",
              };
            } else updatedMap.push({ path, taskIds: [pendingId], kinds: ["MODIFIED"],
              overlap: "NONE", protectedPath: matchesPath(path, repository.protectedPaths),
              generated: matchesPath(path, repository.generatedPaths) });
          }
          run = await this.saveFenced({ ...run,
            taskIds: [...run.taskIds, pendingId],
            sourceWorkspaceIds: [...run.sourceWorkspaceIds, pendingResult.workspaceId!],
            integrationOrder: [...run.integrationOrder, pendingId],
            changeMap: updatedMap,
            contractFindings: checkGeneratedContracts(updatedMap, repository.metadata.contractBindings),
            securityReviewRequired: run.securityReviewRequired ||
              pendingResult.filesChanged.some((path) => sensitivePath(path) || matchesPath(path, repository.protectedPaths)),
            repairCostUsd: (Number(run.repairCostUsd) + Number(pendingResult.costUsd)).toFixed(8),
            updatedAt: this.now().toISOString(),
          }, workerId, generation);
        }
      }
      if (
        objective.status !== "COMPLETED" ||
        selected.length !== tasks.length ||
        run.integrationOrder.some((id) => {
          const result = selected.find((item) => item.taskId === id);
          const task = tasks.find((item) => item.id === id);
          return (
            !result ||
            !task ||
            task.status !== "COMPLETE" ||
            result.workspaceId !== run.sourceWorkspaceIds[run.taskIds.indexOf(id)] ||
            result.agentId !== task.assignedAgentId ||
            result.validationStatus !== "PASS" ||
            !["NOT_REQUIRED", "PASS"].includes(result.reviewStatus)
          );
        })
      )
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "Completed task evidence changed after planning.",
        );
      const resultByTask = new Map(selected.map((result) => [result.taskId, result]));
      const agentId = run.integrationOrder
        .map((id) => resultByTask.get(id)?.agentId)
        .find(Boolean);
      if (!agentId)
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "Integration agent identity is unavailable.",
        );
      if (run.contractFindings.length) {
        if (this.manager)
          return await this.scheduleRepair(context, run, workerId, generation,
            "CONTRACT_MISMATCH", run.contractFindings.map((finding) => finding.summary).join("; ").slice(0, 1_000),
            null, null, run.contractFindings.flatMap((finding) => finding.paths));
        await this.saveFenced(
          { ...run, status: "BLOCKED", completedAt: this.now().toISOString(), updatedAt: this.now().toISOString() },
          workerId,
          generation,
        );
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "Declared schema source changed without a registered generated-client update.",
        );
      }
      run = await this.saveFenced(
        { ...run, status: "INTEGRATING", updatedAt: this.now().toISOString() },
        workerId,
        generation,
      );
      const initial = await this.gateway.invoke({
        ownerId: context.ownerId,
        companyId: context.companyId,
        repositoryId: run.repositoryId,
        workspaceId: run.integrationWorkspaceId,
        taskId: run.objectiveId,
        agentId,
        capability: "repository.worktree_inspect",
        operationInput: {},
        signal: controller.signal,
        transport: context,
      });
      const initialState = initial.output as {
        headCommit?: unknown;
        branch?: unknown;
        dirty?: unknown;
        exists?: unknown;
      };
      if (
        initialState.exists !== true ||
        initialState.branch !== run.integrationBranch ||
        initialState.dirty !== false
      )
        throw new EngineeringIntegrationError(
          "INTEGRATION_NOT_READY",
          "Integration worktree identity or cleanliness changed.",
        );
      if (
        initialState.headCommit !== run.baseCommit &&
        !["INTEGRATING", "VALIDATING", "REVIEWING", "REPAIRING", "CONFLICTED", "FAILED"].includes(claimed.status)
      )
        throw new EngineeringIntegrationError(
          "STALE_CANDIDATE",
          "Integration worktree moved before initial execution.",
        );
      if (
        initialState.headCommit === run.baseCommit &&
        !run.baselineValidationReportId
      ) {
        const baseline = await this.gateway.invoke({
          ownerId: context.ownerId,
          companyId: context.companyId,
          repositoryId: run.repositoryId,
          workspaceId: run.integrationWorkspaceId,
          taskId: run.objectiveId,
          agentId,
          capability: "repository.validate",
          operationInput: {},
          signal: controller.signal,
          transport: context,
        });
        if (baseline.validationReportId)
          run = await this.saveFenced(
            {
              ...run,
              baselineValidationReportId: baseline.validationReportId,
              updatedAt: this.now().toISOString(),
            },
            workerId,
            generation,
          );
      }
      let headCommit = run.baseCommit;
      for (const taskId of run.integrationOrder) {
        if (controller.signal.aborted)
          throw new EngineeringIntegrationError(
            "LEASE_LOST",
            "Integration was cancelled or lease lost.",
          );
        await this.renew(run, workerId, generation);
        const result = resultByTask.get(taskId);
        if (!result?.workspaceId)
          throw new EngineeringIntegrationError(
            "INTEGRATION_NOT_READY",
            "A task result lost its source workspace.",
          );
        const prepared = EngineeringPreparedCommitSchema.parse(
          (
            await this.gateway.invoke({
              ownerId: context.ownerId,
              companyId: context.companyId,
              repositoryId: run.repositoryId,
              workspaceId: result.workspaceId,
              taskId,
              agentId: result.agentId,
              capability: "repository.prepare_commit",
              operationInput: { taskId, agentId: result.agentId },
              signal: controller.signal,
              transport: context,
            })
          ).output,
        );
        if (
          JSON.stringify([...prepared.files].sort()) !==
          JSON.stringify([...result.filesChanged].sort())
        )
          throw new EngineeringIntegrationError(
            "INTEGRATION_NOT_READY",
            "Prepared task files differ from the validated task result.",
          );
        let integrated = EngineeringCommitIntegrationResultSchema.parse(
          (
            await this.gateway.invoke({
              ownerId: context.ownerId,
              companyId: context.companyId,
              repositoryId: run.repositoryId,
              workspaceId: run.integrationWorkspaceId,
              taskId: run.objectiveId,
              agentId,
              capability: "repository.integrate_commit",
              operationInput: {
                commit: prepared.commit,
                sourceWorkspaceId: result.workspaceId,
              },
              signal: controller.signal,
              transport: context,
            })
          ).output,
        );
        headCommit = integrated.headCommit;
        if (!integrated.integrated) {
          const taskIds = [
            ...new Set([
              taskId,
              ...run.integrationOrder.slice(0, run.integrationOrder.indexOf(taskId)),
            ]),
          ].slice(0, 30);
          const repository = await this.runtime.findRepository(
            context.ownerId,
            context.companyId,
            run.repositoryId,
          );
          let conflicts: EngineeringIntegrationConflict[] = integrated.conflictPaths.map((path) => ({
            ...(run.conflicts.find((conflict) => conflict.path === path) ?? {}),
            id: run.conflicts.find((conflict) => conflict.path === path)?.id ?? crypto.randomUUID(),
            path,
            hunks: integrated.conflictHunks.filter((hunk) => hunk.path === path)
              .map(({ startLine, endLine }) => ({ startLine, endLine })),
            taskIds,
            type: this.conflictType(
              path,
              repository?.protectedPaths ?? [],
              repository?.generatedPaths ?? [],
            ),
            riskLevel:
              this.conflictType(
                path,
                repository?.protectedPaths ?? [],
                repository?.generatedPaths ?? [],
              ) === "TEXTUAL_SAFE"
                ? ("LOW" as const)
                : ("HIGH" as const),
            status: "DETECTED" as const,
            attempts: run.conflicts.find((conflict) => conflict.path === path)?.attempts ?? 0,
            resolverModel: null,
            resolverProviderId: null,
            resolverInputTokens: 0,
            resolverOutputTokens: 0,
            resolverAgentId: null,
            resolutionResult: "NOT_ATTEMPTED" as const,
            validationReportId: null,
            summary:
              "Cherry-pick conflict was aborted pending bounded policy classification.",
          }));
          run = await this.saveFenced({ ...run, conflicts, updatedAt: this.now().toISOString() }, workerId, generation);
          const eligible = conflicts.length === 1 && conflicts[0]?.type === "TEXTUAL_SAFE" &&
            conflicts[0].riskLevel === "LOW" && conflicts[0].attempts < 2 &&
            this.conflictResolver && repository && !sensitivePath(conflicts[0].path) &&
            /\.md$/i.test(conflicts[0].path) &&
            !matchesPath(conflicts[0].path, repository.protectedPaths) &&
            !matchesPath(conflicts[0].path, repository.generatedPaths);
          if (eligible) {
            const path = conflicts[0]!.path;
            const [existing, incoming] = await Promise.all([
              this.gateway.invoke({ ownerId: context.ownerId, companyId: context.companyId,
                repositoryId: run.repositoryId, workspaceId: run.integrationWorkspaceId,
                taskId: run.objectiveId, agentId, capability: "repository.file_read",
                operationInput: { path, startLine: 1, maxBytes: 8_192 },
                signal: controller.signal, transport: context }),
              this.gateway.invoke({ ownerId: context.ownerId, companyId: context.companyId,
                repositoryId: run.repositoryId, workspaceId: result.workspaceId,
                taskId, agentId: result.agentId, capability: "repository.file_read",
                operationInput: { path, startLine: 1, maxBytes: 8_192 },
                signal: controller.signal, transport: context }),
            ]);
            const left = EngineeringFileReadResultSchema.parse(existing.output);
            const right = EngineeringFileReadResultSchema.parse(incoming.output);
            if (!left.truncated && !right.truncated && !left.redactions.length && !right.redactions.length) {
              const proposed = await this.conflictResolver!.propose({
                ownerId: context.ownerId, companyId: context.companyId,
                objectiveId: run.objectiveId, runId: run.id,
                resolverAgentId: agentId, path,
                existingContent: left.content, incomingContent: right.content,
                taskSummaries: selected.filter((item) => taskIds.includes(item.taskId))
                  .map((item) => item.diffSummary.slice(0, 500)).slice(0, 10),
                signal: controller.signal,
              });
              conflicts = conflicts.map((conflict) => ({
                ...conflict,
                attempts: conflict.attempts + 1,
                resolverModel: proposed.modelId,
                resolverProviderId: proposed.providerId,
                resolverInputTokens: proposed.inputTokens ?? 0,
                resolverOutputTokens: proposed.outputTokens ?? 0,
                resolverAgentId: agentId,
                resolutionResult: "REJECTED" as const,
                summary: proposed.summary,
              }));
              run = await this.saveFenced({ ...run, conflicts,
                integrationCostUsd: (Number(run.integrationCostUsd) + Number(proposed.costUsd)).toFixed(8),
                updatedAt: this.now().toISOString() }, workerId, generation);
              if (proposed.decision === "RESOLVE_ADDITIVE" && proposed.confidence >= 0.9 &&
                  proposed.modelId && proposed.providerId) {
                try {
                  integrated = EngineeringCommitIntegrationResultSchema.parse((await this.gateway.invoke({
                    ownerId: context.ownerId, companyId: context.companyId,
                    repositoryId: run.repositoryId, workspaceId: run.integrationWorkspaceId,
                    taskId: run.objectiveId, agentId,
                    capability: "repository.resolve_additive_docs_conflict",
                    operationInput: { commit: prepared.commit, sourceWorkspaceId: result.workspaceId,
                      path, expectedHead: headCommit },
                    signal: controller.signal, transport: context,
                  })).output);
                  if (integrated.integrated) {
                    headCommit = integrated.headCommit;
                    conflicts = conflicts.map((conflict) => ({ ...conflict,
                      status: "RESOLVED" as const, resolutionResult: "APPLIED" as const,
                    }));
                    run = await this.saveFenced({ ...run, conflicts, updatedAt: this.now().toISOString() }, workerId, generation);
                  }
                } catch {
                  // The native deterministic proof failed; never synthesize a resolution.
                }
              }
            }
          }
          if (integrated.integrated) continue;
          conflicts = conflicts.map((conflict) => ({ ...conflict, status: "ESCALATED" as const,
            summary: conflict.resolutionResult === "NOT_ATTEMPTED"
              ? "Automatic resolution denied by conflict policy or missing bounded evidence."
              : conflict.summary,
          }));
          run = await this.saveFenced(
            {
              ...run,
              conflicts,
              status: "CONFLICTED",
              integrationDurationMs: Math.max(0, this.now().getTime() - started),
              completedAt: this.now().toISOString(),
              updatedAt: this.now().toISOString(),
            },
            workerId,
            generation,
          );
          await this.auditEvent(
            context,
            "ENGINEERING_INTEGRATION_CONFLICT_DETECTED",
            "Integration conflict escalated after bounded policy and resolver checks.",
            { integrationRunId: run.id, conflictCount: conflicts.length },
          );
          return this.view(context.ownerId, context.companyId, run.id);
        }
      }
      const integrationFinished = this.now().getTime();
      run = await this.saveFenced(
        {
          ...run,
          status: "VALIDATING",
          integrationDurationMs: Math.max(0, integrationFinished - started),
          updatedAt: this.now().toISOString(),
        },
        workerId,
        generation,
      );
      const validationStarted = this.now().getTime();
      const validation = await this.gateway.invoke({
        ownerId: context.ownerId,
        companyId: context.companyId,
        repositoryId: run.repositoryId,
        workspaceId: run.integrationWorkspaceId,
        taskId: run.objectiveId,
        agentId,
        capability: "repository.validate",
        operationInput: {},
        signal: controller.signal,
        transport: context,
      });
      if (validation.validationReportId) {
        const [baselineReport, integratedReport] = await Promise.all([
          run.baselineValidationReportId
            ? this.runtime.findValidation(context.ownerId, context.companyId, run.baselineValidationReportId)
            : Promise.resolve(undefined),
          this.runtime.findValidation(context.ownerId, context.companyId, validation.validationReportId),
        ]);
        if (integratedReport) {
          run = await this.saveFenced(
            {
              ...run,
              validationReportId: validation.validationReportId,
              regressionEvidence: classifyValidationRegressions(baselineReport, integratedReport),
              updatedAt: this.now().toISOString(),
            },
            workerId,
            generation,
          );
        }
      }
      if (validation.validationStatus !== "PASS" || !validation.validationReportId) {
        if (this.manager) {
          const report = validation.validationReportId
            ? await this.runtime.findValidation(context.ownerId, context.companyId, validation.validationReportId)
            : undefined;
          const category = run.conflicts.some((item) => item.status === "RESOLVED")
            ? "CONFLICT_RESOLUTION_DEFECT" as const
            : report?.steps.some((step) => step.status === "FAIL" &&
                ["TYPECHECK", "BUILD"].includes(step.kind))
              ? "TYPE_BUILD_FAILURE" as const : "TEST_FAILURE" as const;
          return await this.scheduleRepair(context, run, workerId, generation, category,
            "Combined registered validation failed after integration.",
            validation.validationReportId ?? null, null, report?.steps.flatMap((step) =>
              step.failures.map((failure) => failure.file).filter((file): file is string => Boolean(file))) ?? []);
        }
        throw new EngineeringIntegrationError("VALIDATION_FAILED", "Full registered repository validation did not pass.");
      }
      await this.assertHead(context, run, agentId, headCommit, controller.signal);
      const diff = EngineeringDiffResultSchema.parse(
        (
          await this.gateway.invoke({
            ownerId: context.ownerId,
            companyId: context.companyId,
            repositoryId: run.repositoryId,
            workspaceId: run.integrationWorkspaceId,
            taskId: run.objectiveId,
            agentId,
            capability: "repository.integration_diff",
            operationInput: { baseCommit: run.baseCommit, maxBytes: 131_072 },
            signal: controller.signal,
            transport: context,
          })
        ).output,
      );
      if (
        diff.truncated ||
        diff.redactions.length ||
        diff.files.some((file) => file.binary)
      )
        throw new EngineeringIntegrationError(
          "REVIEW_FAILED",
          "Combined diff is truncated, binary, or contains likely secrets; owner review is required.",
        );
      run = await this.saveFenced(
        {
          ...run,
          status: "REVIEWING",
          validationReportId: validation.validationReportId,
          conflicts: run.conflicts.map((conflict) => conflict.status === "RESOLVED"
            ? { ...conflict, resolutionResult: "VALIDATED" as const,
                validationReportId: validation.validationReportId! }
            : conflict),
          validationDurationMs: Math.max(0, this.now().getTime() - validationStarted),
          updatedAt: this.now().toISOString(),
        },
        workerId,
        generation,
      );
      await this.auditEvent(
        context,
        "ENGINEERING_INTEGRATION_VALIDATION_EXECUTED",
        "Integrated head passed the registered validation profile.",
        { integrationRunId: run.id, validationReportId: validation.validationReportId },
      );
      const reviewStarted = this.now().getTime();
      const expectedFiles = [
        ...new Set(
          selected
            .filter((result) => run.taskIds.includes(result.taskId))
            .flatMap((result) => result.filesChanged),
        ),
      ].sort();
      const filesChanged = diff.files.map((file) => file.path).sort();
      if (JSON.stringify(expectedFiles) !== JSON.stringify(filesChanged))
        throw new EngineeringIntegrationError(
          "REVIEW_FAILED",
          "Combined diff files differ from the validated task outputs.",
        );
      const authorIds = new Set(selected.map((result) => result.agentId));
      const repository = await this.runtime.findRepository(
        context.ownerId,
        context.companyId,
        run.repositoryId,
      );
      const excluded = [...new Set([...authorIds, objective.managerAgentId])];
      const reviewerAgentId = repository
        ? await this.selectReviewer(run, repository.authorizedAgentIds, excluded, false)
        : undefined;
      if (!reviewerAgentId)
        throw new EngineeringIntegrationError(
          "REVIEW_FAILED",
          "No independent repository-authorized reviewer is available.",
        );
      const review = await this.performReview(
        run,
        reviewerAgentId,
        headCommit,
        false,
        selected,
        objective.acceptanceCriteria,
        filesChanged,
        diff.patch,
        controller.signal,
      );
      await this.auditEvent(
        context,
        "ENGINEERING_INTEGRATION_REVIEW_EXECUTED",
        "Independent integration review completed.",
        { integrationRunId: run.id, reviewId: review.id, verdict: review.verdict },
      );
      if (!["PASS", "PASS_WITH_WARNINGS"].includes(review.verdict)) {
        if (review.verdict === "CHANGES_REQUIRED" && this.manager)
          return await this.scheduleRepair(context, run, workerId, generation,
            "REVIEW_CHANGES_REQUIRED", review.findings.join("; ").slice(0, 1_000) ||
            "Independent integration review requested changes.",
            validation.validationReportId, review.id, []);
        throw new EngineeringIntegrationError("REVIEW_FAILED", "Independent integration review requires changes.");
      }
      let securityReview: EngineeringIntegrationReview | null = null;
      if (run.securityReviewRequired) {
        const securityReviewer = repository
          ? await this.selectReviewer(
              run,
              repository.authorizedAgentIds,
              [...excluded, reviewerAgentId],
              true,
            )
          : undefined;
        if (!securityReviewer)
          throw new EngineeringIntegrationError(
            "REVIEW_FAILED",
            "A distinct repository-authorized security reviewer is required.",
          );
        securityReview = await this.performReview(
          run,
          securityReviewer,
          headCommit,
          true,
          selected,
          objective.acceptanceCriteria,
          filesChanged,
          diff.patch,
          controller.signal,
        );
        await this.auditEvent(
          context,
          "ENGINEERING_INTEGRATION_REVIEW_EXECUTED",
          "Independent security review completed.",
          {
            integrationRunId: run.id,
            reviewId: securityReview.id,
            verdict: securityReview.verdict,
            securityReview: true,
          },
        );
        if (!["PASS", "PASS_WITH_WARNINGS"].includes(securityReview.verdict)) {
          if (securityReview.verdict === "CHANGES_REQUIRED" && this.manager)
            return await this.scheduleRepair(context, run, workerId, generation,
              "REVIEW_CHANGES_REQUIRED", securityReview.findings.join("; ").slice(0, 1_000) ||
              "Independent security review requested changes.", validation.validationReportId,
              securityReview.id, []);
          throw new EngineeringIntegrationError("REVIEW_FAILED", "Security review blocked the merge candidate.");
        }
      }
      const evidence: AcceptanceEvidence[] = objective.acceptanceCriteria.map(
        (criterion) => {
          const assessed = review.acceptanceEvidence.find(
            (item) => item.criterion === criterion,
          );
          return assessed ?? { criterion, evidence: [], satisfied: false };
        },
      );
      if (evidence.some((item) => !item.satisfied || item.evidence.length === 0)) {
        if (this.manager)
          return await this.scheduleRepair(context, run, workerId, generation,
            "REVIEW_CHANGES_REQUIRED", "Acceptance criteria lack independently cited evidence.",
            validation.validationReportId, review.id, []);
        throw new EngineeringIntegrationError("REVIEW_FAILED", "Acceptance criteria lack independently cited evidence.");
      }
      await this.assertHead(context, run, agentId, headCommit, controller.signal);
      const candidate = EngineeringMergeCandidateSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId: run.ownerId,
        companyId: run.companyId,
        runId: run.id,
        objectiveId: run.objectiveId,
        repositoryId: run.repositoryId,
        integrationWorkspaceId: run.integrationWorkspaceId,
        branch: run.integrationBranch,
        baseCommit: run.baseCommit,
        headCommit,
        tasksIncluded: run.taskIds,
        validationReportId: validation.validationReportId,
        reviewReportId: review.id,
        securityReviewId: securityReview?.id ?? null,
        acceptanceEvidence: evidence,
        filesChanged,
        diffSummary: selected
          .filter((result) => run.taskIds.includes(result.taskId))
          .map((result) => result.diffSummary)
          .join("\n")
          .slice(0, 4_000),
        risks: [...(securityReview?.findings ?? []), ...review.findings].slice(0, 50),
        warnings: [review, securityReview]
          .filter((item): item is EngineeringIntegrationReview => Boolean(item))
          .filter((item) => item.verdict === "PASS_WITH_WARNINGS")
          .flatMap((item) => item.findings)
          .slice(0, 50),
        dependencyChanges: filesChanged
          .filter((path) =>
            /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|pyproject\.toml|requirements.*\.txt|gradle.*)$/.test(
              path,
            ),
          )
          .slice(0, 100),
        status: "READY",
        validatedHeadCommit: headCommit,
        reviewedHeadCommit: headCommit,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });
      run = EngineeringIntegrationRunSchema.parse({
        ...run,
        status: "READY",
        reviewId: review.id,
        securityReviewId: securityReview?.id ?? null,
        reviewDurationMs: Math.max(0, this.now().getTime() - reviewStarted),
        reviewCostUsd: review.costUsd,
        securityReviewCostUsd: securityReview?.costUsd ?? "0.0",
        completedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });
      if (
        controller.signal.aborted ||
        !(await this.store.commitReady(
          run,
          candidate,
          workerId,
          generation,
          this.now().toISOString(),
        ))
      )
        throw new EngineeringIntegrationError(
          "LEASE_LOST",
          "Integration lease was lost before candidate publication.",
        );
      await this.auditEvent(
        context,
        "ENGINEERING_MERGE_CANDIDATE_READY",
        "Validated and independently reviewed merge candidate is ready for a separate governed decision.",
        { integrationRunId: run.id, mergeCandidateId: candidate.id, headCommit },
      );
      return this.view(context.ownerId, context.companyId, run.id);
    } catch (error) {
      const current = await this.store.findRun(
        context.ownerId,
        context.companyId,
        run.id,
      );
      if (current && !["BLOCKED", "CONFLICTED", "CANCELLED", "READY"].includes(current.status))
        await this.store.saveRunFenced(
          EngineeringIntegrationRunSchema.parse({
            ...current,
            status: "FAILED",
            completedAt: this.now().toISOString(),
            updatedAt: this.now().toISOString(),
          }),
          workerId,
          generation,
          this.now().toISOString(),
        );
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (this.active.get(run.id) === controller) this.active.delete(run.id);
      await this.store.releaseLease({
        ownerId: context.ownerId,
        companyId: context.companyId,
        runId: run.id,
        workerId,
        generation,
        now: this.now().toISOString(),
      });
    }
  }

  async refreshStaleness(context: EngineeringIntegrationContext, runId: string) {
    const view = await this.view(context.ownerId, context.companyId, runId);
    if (!view.candidate || view.candidate.status !== "READY") return view;
    const repository = await this.runtime.findRepository(
      context.ownerId,
      context.companyId,
      view.run.repositoryId,
    );
    const agentId = repository?.authorizedAgentIds[0];
    if (!repository || !agentId)
      throw new EngineeringIntegrationError(
        "REPOSITORY_NOT_AUTHORIZED",
        "Repository inspection is unavailable.",
      );
    const inspection = await this.gateway.invoke({
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: repository.id,
      workspaceId: null,
      taskId: view.run.objectiveId,
      agentId,
      capability: "repository.inspect",
      operationInput: {},
      signal: new AbortController().signal,
      transport: context,
    });
    const baseCommit = (inspection.output as { baseCommit?: unknown }).baseCommit;
    if (baseCommit !== view.candidate.baseCommit) {
      await this.store.saveCandidate(
        EngineeringMergeCandidateSchema.parse({
          ...view.candidate,
          status: "STALE",
          updatedAt: this.now().toISOString(),
        }),
      );
      await this.auditEvent(
        context,
        "ENGINEERING_MERGE_CANDIDATE_STALE",
        "Merge candidate became stale after the protected branch moved.",
        { integrationRunId: view.run.id, mergeCandidateId: view.candidate.id },
      );
    }
    return this.view(context.ownerId, context.companyId, runId);
  }

  async cancel(context: EngineeringIntegrationContext, runId: string) {
    const view = await this.view(context.ownerId, context.companyId, runId);
    if (["READY", "CANCELLED"].includes(view.run.status)) return view;
    this.active.get(runId)?.abort();
    await this.gateway.cancelExecutions({
      ownerId: context.ownerId,
      companyId: context.companyId,
      workspaceId: view.run.integrationWorkspaceId,
      reason: "Engineering integration cancelled by owner.",
    });
    const run = EngineeringIntegrationRunSchema.parse({
      ...view.run,
      status: "CANCELLED",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveRun(run);
    if (view.candidate)
      await this.store.saveCandidate(
        EngineeringMergeCandidateSchema.parse({
          ...view.candidate,
          status: "CANCELLED",
          updatedAt: this.now().toISOString(),
        }),
      );
    await this.auditEvent(
      context,
      "ENGINEERING_INTEGRATION_CANCELLED",
      "Engineering integration run cancelled; worktree retained for inspection.",
      { integrationRunId: run.id },
    );
    return this.view(context.ownerId, context.companyId, runId);
  }

  async view(ownerId: string, companyId: string, runId: string) {
    const run = await this.store.findRun(ownerId, companyId, runId);
    if (!run)
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_FOUND",
        "Engineering integration run not found.",
      );
    return EngineeringIntegrationViewSchema.parse({
      run,
      candidate:
        (await this.store.findCandidateByRun(ownerId, companyId, runId)) ?? null,
      reviews: await this.store.listReviews(ownerId, companyId, runId),
    });
  }

  list(ownerId: string, companyId: string, limit = 100) {
    return this.store.listRuns(ownerId, companyId, Math.min(Math.max(limit, 1), 100));
  }

  private async performReview(
    run: EngineeringIntegrationRun,
    reviewerAgentId: string,
    headCommit: string,
    security: boolean,
    taskResults: EngineeringTaskResult[],
    acceptanceCriteria: string[],
    filesChanged: string[],
    combinedPatch: string,
    signal: AbortSignal,
  ) {
    const output = await this.reviewer.review({
      run,
      headCommit,
      reviewerAgentId,
      security,
      taskResults,
      acceptanceCriteria,
      filesChanged,
      combinedPatch,
      signal,
    });
    const review = EngineeringIntegrationReviewSchema.parse({
      ...output,
      id: crypto.randomUUID(),
      ownerId: run.ownerId,
      companyId: run.companyId,
      runId: run.id,
      reviewerAgentId,
      headCommit,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveReview(review);
    return review;
  }

  private async assertHead(
    context: EngineeringIntegrationContext,
    run: EngineeringIntegrationRun,
    agentId: string,
    expectedHead: string,
    signal: AbortSignal,
  ) {
    const state = await this.gateway.invoke({
      ownerId: context.ownerId,
      companyId: context.companyId,
      repositoryId: run.repositoryId,
      workspaceId: run.integrationWorkspaceId,
      taskId: run.objectiveId,
      agentId,
      capability: "repository.worktree_inspect",
      operationInput: {},
      signal,
      transport: context,
    });
    const inspected = state.output as {
      exists?: unknown;
      headCommit?: unknown;
      branch?: unknown;
      dirty?: unknown;
    };
    if (
      inspected.exists !== true ||
      inspected.headCommit !== expectedHead ||
      inspected.branch !== run.integrationBranch ||
      inspected.dirty !== false
    )
      throw new EngineeringIntegrationError(
        "STALE_CANDIDATE",
        "Integration head changed after validation or review.",
      );
  }

  private async scheduleRepair(
    context: EngineeringIntegrationContext,
    run: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
    category: EngineeringIntegrationRun["repairEvidence"][number]["category"],
    summary: string,
    validationReportId: string | null,
    reviewId: string | null,
    failedFiles: string[],
  ) {
    if (!this.manager)
      throw new EngineeringIntegrationError("INTEGRATION_NOT_READY", "Engineering Manager repair service is unavailable.");
    if (run.repairCycles >= run.maxRepairCycles) {
      const blocked = await this.saveFenced({ ...run, status: "BLOCKED",
        completedAt: this.now().toISOString(), updatedAt: this.now().toISOString() },
      workerId, generation);
      await this.auditEvent(context, "ENGINEERING_INTEGRATION_REPAIR_BLOCKED",
        "Bounded integration repair cycle limit reached; owner escalation required.",
        { integrationRunId: run.id, repairCycles: run.repairCycles });
      return this.view(context.ownerId, context.companyId, blocked.id);
    }
    const responsible = [...run.integrationOrder].reverse().find((id) =>
      failedFiles.some((file) => run.changeMap.some((entry) => entry.path === file && entry.taskIds.includes(id)))) ??
      run.integrationOrder.at(-1);
    if (!responsible)
      throw new EngineeringIntegrationError("INTEGRATION_NOT_READY", "Responsible engineering task cannot be identified.");
    const cycle = run.repairCycles + 1;
    const task = await this.manager.createIntegrationRepairTask(context, {
      objectiveId: run.objectiveId, integrationRunId: run.id, cycle,
      parentTaskId: responsible, category, summary,
    });
    const repairing = await this.saveFenced({ ...run,
      status: "REPAIRING", repairCycles: cycle,
      repairTaskIds: [...run.repairTaskIds, task.id],
      repairEvidence: [...run.repairEvidence, { cycle, taskId: task.id,
        parentTaskId: responsible, category, summary,
        validationReportId, reviewId }],
      validationReportId,
      completedAt: null, updatedAt: this.now().toISOString(),
    }, workerId, generation);
    await this.auditEvent(context, "ENGINEERING_INTEGRATION_REPAIR_CREATED",
      "Bounded repair task created through the existing Engineering Manager.",
      { integrationRunId: run.id, repairTaskId: task.id, repairCycle: cycle,
        category });
    return this.view(context.ownerId, context.companyId, repairing.id);
  }

  private changeMap(
    results: EngineeringTaskResult[],
    kinds: Map<string, Map<string, EngineeringChangeMapEntry["kinds"][number]>>,
    protectedPaths: string[],
    generatedPaths: string[],
  ): EngineeringChangeMapEntry[] {
    const paths = new Map<string, string[]>();
    for (const result of results)
      for (const path of result.filesChanged)
        paths.set(path, [...(paths.get(path) ?? []), result.taskId]);
    return [...paths.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, taskIds]) => ({
        path,
        taskIds: [...new Set(taskIds)],
        kinds: [...(kinds.get(path)?.values() ?? ["MODIFIED" as const])],
        overlap: new Set(taskIds).size > 1 ? "SAME_FILE" : "NONE",
        protectedPath: matchesPath(path, protectedPaths),
        generated: matchesPath(path, generatedPaths),
      }));
  }

  private conflictType(
    path: string,
    protectedPaths: string[],
    generatedPaths: string[],
  ) {
    if (matchesPath(path, protectedPaths) || sensitivePath(path)) return "SECURITY_SENSITIVE" as const;
    if (matchesPath(path, generatedPaths)) return "GENERATED_FILE" as const;
    if (/(^|\/)(migrations?|schema)(\/|\.|$)/i.test(path)) return "MIGRATION" as const;
    if (/(^|\/)(contracts?|openapi|graphql)(\/|\.|$)/i.test(path))
      return "CONTRACT" as const;
    if (/\.md$/i.test(path)) return "TEXTUAL_SAFE" as const;
    return "UNKNOWN" as const;
  }

  private async selectReviewer(
    run: EngineeringIntegrationRun,
    repositoryAgentIds: string[],
    excludedAgentIds: string[],
    security: boolean,
  ) {
    const selected = await this.reviewerSelector?.select({
      ownerId: run.ownerId,
      companyId: run.companyId,
      objectiveId: run.objectiveId,
      repositoryAgentIds,
      excludedAgentIds,
      security,
    });
    if (
      selected &&
      repositoryAgentIds.includes(selected) &&
      !excludedAgentIds.includes(selected)
    )
      return selected;
    if (this.reviewerSelector) return undefined;
    return repositoryAgentIds.find((id) => !excludedAgentIds.includes(id));
  }

  private async requireObjective(
    context: Pick<EngineeringIntegrationContext, "ownerId" | "companyId">,
    objectiveId: string,
  ) {
    const objective = await this.orchestration.findObjective(
      context.ownerId,
      context.companyId,
      objectiveId,
    );
    if (!objective)
      throw new EngineeringIntegrationError(
        "INTEGRATION_NOT_READY",
        "Engineering objective not found in company scope.",
      );
    return objective;
  }

  private async renew(
    run: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
  ) {
    const at = this.now();
    const renewed = await this.store.renewLease({
      ownerId: run.ownerId,
      companyId: run.companyId,
      runId: run.id,
      workerId,
      generation,
      now: at.toISOString(),
      expiresAt: new Date(at.getTime() + this.leaseMs).toISOString(),
    });
    if (!renewed)
      throw new EngineeringIntegrationError(
        "LEASE_LOST",
        "Integration lease was lost; stale worker mutation denied.",
      );
  }

  private async saveFenced(
    value: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
  ) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    if (
      !(await this.store.saveRunFenced(
        run,
        workerId,
        generation,
        this.now().toISOString(),
      ))
    )
      throw new EngineeringIntegrationError(
        "LEASE_LOST",
        "Integration lease was lost; stale worker mutation denied.",
      );
    return run;
  }

  private auditEvent(
    context: EngineeringIntegrationContext,
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    reason: string,
    metadata: Record<string, string | number | boolean | null>,
  ) {
    return this.audit({
      eventType,
      ownerId: context.ownerId,
      companyId: context.companyId,
      ...(context.deviceId ? { deviceId: context.deviceId } : {}),
      outcome: "SUCCESS",
      reason,
      metadata,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });
  }
}
