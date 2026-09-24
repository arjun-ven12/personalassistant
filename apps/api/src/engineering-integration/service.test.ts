import {
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
  EngineeringTaskResultSchema,
  EngineeringTaskSchema,
  EngineeringValidationReportSchema,
  EngineeringWorkspaceSchema,
  type EngineeringCapability,
} from "@alexa-control/shared";
import { describe, expect, it, vi } from "vitest";

import { InMemoryEngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import { ApprovalService } from "../governance/approval-service.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import {
  EngineeringIntegrationService,
  type EngineeringIntegrationGateway,
  type EngineeringIntegrationReviewer,
} from "./service.js";
import { InMemoryEngineeringIntegrationStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const otherCompanyId = "30000000-0000-4000-8000-000000000003";
const repositoryId = "40000000-0000-4000-8000-000000000004";
const authorId = "50000000-0000-4000-8000-000000000005";
const secondAuthorId = "51000000-0000-4000-8000-000000000005";
const reviewerId = "60000000-0000-4000-8000-000000000006";
const securityReviewerId = "70000000-0000-4000-8000-000000000007";
const managerId = "80000000-0000-4000-8000-000000000008";
const baseCommit = "a".repeat(40);
const context = {
  ownerId,
  companyId,
  requestId: "phase-27-3-test",
  ipAddress: "100.64.0.10",
  sessionId: "80000000-0000-4000-8000-000000000008",
  networkState: "PRIVATE_NETWORK" as const,
};

class FakeGateway implements EngineeringIntegrationGateway {
  conflictAt = -1;
  conflictPath = "src/change.ts";
  persistentConflict = false;
  readonly appliedCommits = new Set<string>();
  integrations = 0;
  resolutions = 0;
  currentBase = baseCommit;
  headCommit = baseCommit;
  integrationBranch = "";
  readonly filesByTask = new Map<string, string>();
  validations = 0;
  failFinalValidation = false;
  failValidationCalls = new Set<number>();
  merges = 0;
  failAfterMerge = false;
  diffTruncated = false;
  diffRedactions: string[] = [];
  readonly calls: Array<{ capability: EngineeringCapability; workspaceId: string | null; agentId: string }> = [];
  constructor(readonly runtime: InMemoryEngineeringRuntimeStore) {}
  prepare() { return Promise.resolve(); }
  create(input: Parameters<EngineeringIntegrationGateway["create"]>[0]) {
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
        branchName: `alexa/${input.taskId.replaceAll("-", "").slice(0, 12)}-123456-integration`,
        worktreeLocator: `ew-${id}`,
        baseCommit: this.currentBase,
        headCommit: null,
        state: "READY",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: "2026-09-16T00:00:00.000Z",
        updatedAt: "2026-09-16T00:00:00.000Z",
        expiresAt: null,
      }),
    );
    this.integrationBranch = `alexa/${input.taskId.replaceAll("-", "").slice(0, 12)}-123456-integration`;
    return Promise.resolve({ id, baseCommit: this.currentBase });
  }
  cancelExecutions() {
    return Promise.resolve();
  }
  invoke(input: {
    capability: EngineeringCapability;
    operationInput: Record<string, unknown>;
    taskId: string;
    workspaceId: string | null;
    agentId: string;
  }) {
    this.calls.push({ capability: input.capability, workspaceId: input.workspaceId, agentId: input.agentId });
    if (input.capability === "repository.inspect")
      return Promise.resolve({
        output: { baseCommit: this.currentBase, branch: "main", dirty: false },
      });
    if (input.capability === "repository.worktree_inspect")
      return Promise.resolve({
        output: {
          exists: true,
          baseCommit,
          headCommit: this.headCommit,
          branch: this.integrationBranch,
          dirty: false,
        },
      });
    if (input.capability === "repository.git_status") {
      const workspace = this.runtime.findWorkspace(
        ownerId,
        companyId,
        input.workspaceId!,
      );
      return Promise.resolve({
        output: {
          branch: workspace?.branchName,
          entries: [
            {
              path: this.filesByTask.get(input.taskId),
              originalPath: null,
              kind: "MODIFIED",
            },
          ],
          dirty: true,
          truncated: false,
        },
      });
    }
    if (input.capability === "repository.prepare_commit")
      return Promise.resolve({
        output: {
          commit: String(input.operationInput.taskId)
            .replaceAll("-", "")
            .padEnd(40, "b")
            .slice(0, 40),
          files: [this.filesByTask.get(String(input.operationInput.taskId))],
          redactions: [],
        },
      });
    if (input.capability === "repository.integrate_commit") {
      const commit = String(input.operationInput.commit);
      if (this.appliedCommits.has(commit))
        return Promise.resolve({ output: { integrated: true, commit,
          headCommit: this.headCommit, conflictPaths: [] } });
      this.integrations += 1;
      const conflict = this.integrations === this.conflictAt ||
        this.persistentConflict && this.integrations >= 2;
      if (!conflict) {
        this.headCommit = this.integrations.toString(16).padStart(40, "c");
        this.appliedCommits.add(commit);
      }
      return Promise.resolve({
        output: {
          integrated: !conflict,
          commit: input.operationInput.commit,
          headCommit: this.headCommit,
          conflictPaths: conflict ? [this.conflictPath] : [],
        },
      });
    }
    if (input.capability === "repository.file_read") {
      const content = input.workspaceId && this.runtime.findWorkspace(ownerId, companyId, input.workspaceId)?.idempotencyKey.startsWith("integration-")
        ? "Base documentation.\nFirst addition.\n"
        : "Base documentation.\nSecond addition.\n";
      return Promise.resolve({ output: {
        path: input.operationInput.path, startLine: 1, endLine: 2, content,
        sha256: "a".repeat(64), truncated: false, redactions: [],
      } });
    }
    if (input.capability === "repository.resolve_additive_docs_conflict") {
      this.resolutions += 1;
      this.headCommit = "d".repeat(40);
      return Promise.resolve({ output: {
        integrated: true, commit: input.operationInput.commit,
        headCommit: this.headCommit, conflictPaths: [],
      } });
    }
    if (input.capability === "repository.validate") {
      this.validations += 1;
      const failed = this.failFinalValidation && this.validations === 2 ||
        this.failValidationCalls.has(this.validations);
      this.runtime.saveValidation(EngineeringValidationReportSchema.parse({
        id: "90000000-0000-4000-8000-000000000009",
        workspaceId: input.workspaceId,
        status: failed ? "FAIL" : "PASS",
        steps: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      }), ownerId, companyId);
      return Promise.resolve({
        output: {},
        validationStatus: failed ? ("FAIL" as const) : ("PASS" as const),
        validationReportId: "90000000-0000-4000-8000-000000000009",
      });
    }
    if (input.capability === "repository.merge_candidate") {
      const head = String(input.operationInput.candidateHead);
      const base = String(input.operationInput.expectedBase);
      if (this.currentBase !== head && this.currentBase !== base)
        return Promise.reject(new Error("stale target"));
      const alreadyMerged = this.currentBase === head;
      if (!alreadyMerged) {
        this.currentBase = head;
        this.merges += 1;
      }
      if (this.failAfterMerge) {
        this.failAfterMerge = false;
        return Promise.reject(new Error("simulated lost signed result after native merge"));
      }
      return Promise.resolve({ output: { merged: true, alreadyMerged, headCommit: head, targetBranch: "main" } });
    }
    if (input.capability === "repository.integration_diff")
      return Promise.resolve({
        output: {
          patch: "diff --git a/src/change-0.ts b/src/change-0.ts\n+validated change",
          files: [...new Set(this.filesByTask.values())].map((path) => ({
            path,
            additions: 1,
            deletions: 0,
            binary: false,
          })),
          truncated: this.diffTruncated,
          redactions: this.diffRedactions,
        },
      });
    return Promise.resolve({ output: {} });
  }
}

class FakeReviewer implements EngineeringIntegrationReviewer {
  readonly calls: Array<{ security: boolean; reviewerAgentId: string }> = [];
  omitAcceptance = false;
  verdict: "PASS" | "CHANGES_REQUIRED" = "PASS";
  afterReview?: () => void;
  review(input: Parameters<EngineeringIntegrationReviewer["review"]>[0]) {
    this.calls.push({
      security: input.security,
      reviewerAgentId: input.reviewerAgentId,
    });
    this.afterReview?.();
    return Promise.resolve({
      providerId: "test-provider",
      modelId: "sol-reviewer",
      verdict: this.verdict,
      dimensions: {
        correctness: 95,
        scopeAdherence: 95,
        architectureConsistency: 90,
        maintainability: 90,
        security: 95,
        tests: 95,
        regressionRisk: 90,
        acceptanceCoverage: 100,
      },
      findings: [],
      evidence: ["registered validation passed"],
      acceptanceEvidence: this.omitAcceptance
        ? []
        : input.acceptanceCriteria.map((criterion) => ({
            criterion,
            evidence: ["registered validation passed"],
            satisfied: true,
          })),
      inputTokens: 300,
      outputTokens: 100,
      costUsd: "0.01",
    });
  }
}

const setup = (taskCount = 3, risk: "MEDIUM" | "HIGH" = "MEDIUM",
  clock: () => Date = () => new Date("2026-09-16T00:00:10.000Z"), distinctAuthors = false) => {
  const orchestration = new InMemoryEngineeringOrchestrationStore();
  const runtime = new InMemoryEngineeringRuntimeStore();
  const store = new InMemoryEngineeringIntegrationStore();
  const gateway = new FakeGateway(runtime);
  const reviewer = new FakeReviewer();
  const approvals = new ApprovalService(new InMemoryGovernanceStore(), () => undefined);
  const objectiveId = crypto.randomUUID();
  const at = "2026-09-16T00:00:00.000Z";
  runtime.saveRepository(
    EngineeringRepositorySchema.parse({
      schemaVersion: "1",
      id: repositoryId,
      ownerId,
      companyId,
      displayName: "Safe fixture",
      workspaceLocatorId: "repo-safe",
      defaultBranch: "main",
      protectedBranches: ["main"],
      protectedPaths: ["src/auth/**"],
      generatedPaths: ["dist/**"],
      commandProfileId: "node-default",
      capabilityProfileId: "engineering-default",
      authorizedAgentIds: distinctAuthors
        ? [authorId, secondAuthorId, reviewerId, securityReviewerId, managerId]
        : [authorId, reviewerId, securityReviewerId, managerId],
      metadata: {
        languages: ["TypeScript"],
        packageManagers: ["pnpm"],
        frameworks: [],
        importantFiles: ["package.json"],
      },
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    }),
  );
  orchestration.saveObjective(
    EngineeringObjectiveSchema.parse({
      schemaVersion: "1",
      id: objectiveId,
      ownerId,
      companyId,
      repositoryId,
      workflowId: null,
      managerAgentId: managerId,
      title: "Integrate bounded changes",
      description: "Combine completed isolated worktrees.",
      acceptanceCriteria: ["Registered validation passes."],
      constraints: ["No deployment."],
      protectedAreas: [],
      priority: "NORMAL",
      riskLevel: risk,
      budget: null,
      deadlineAt: null,
      status: "COMPLETED",
      clarificationQuestion: null,
      clarification: null,
      maxParallelTasks: 4,
      maxReplans: 2,
      replanCount: 0,
      managerReasoningCount: 1,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: "0.01",
      version: 1,
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    }),
  );
  const tasks = [];
  for (let index = 0; index < taskCount; index += 1) {
    const taskId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const type =
      index === 0
        ? ("DATABASE" as const)
        : index === taskCount - 1
          ? ("TESTING" as const)
          : ("BACKEND" as const);
    const dependencies = index === 0 ? [] : [tasks[index - 1]!.id];
    const taskAuthorId = distinctAuthors && index === taskCount - 1 ? secondAuthorId : authorId;
    const task = EngineeringTaskSchema.parse({
      schemaVersion: "1",
      id: taskId,
      ownerId,
      companyId,
      objectiveId,
      parentTaskId: null,
      repositoryId,
      workspaceId,
      title: `Task ${index}`,
      description: "Bounded change.",
      acceptanceCriteria: ["Change validates."],
      taskType: type,
      requiredSkills: [],
      requiredCapabilities: ["repository.file_patch", "repository.validate"],
      dependencies,
      riskLevel: risk,
      estimatedDifficulty: "MEDIUM",
      assignedAgentId: taskAuthorId,
      assignedRole:
        type === "DATABASE"
          ? "DATABASE_ENGINEER"
          : type === "TESTING"
            ? "TEST_QA_ENGINEER"
            : "BACKEND_ENGINEER",
      reviewerAgentId: reviewerId,
      agentSessionId: crypto.randomUUID(),
      modelPolicy: {
        initialTier: "TERRA",
        currentTier: "TERRA",
        maxTier: "SOL",
        escalationCount: 0,
        reason: "Fixture.",
      },
      readOnly: false,
      reviewRequired: false,
      status: "COMPLETE",
      attempt: 1,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseGeneration: 1,
      lastFailureCategory: null,
      lastFailureSummary: null,
      createdAt: new Date(Date.parse(at) + index * 1_000).toISOString(),
      startedAt: at,
      completedAt: at,
      updatedAt: at,
    });
    tasks.push(task);
    gateway.filesByTask.set(
      taskId,
      index === 1 ? "src/shared.ts" : `src/change-${index}.ts`,
    );
    orchestration.saveTask(task);
    runtime.createWorkspace(
      EngineeringWorkspaceSchema.parse({
        schemaVersion: "1",
        id: workspaceId,
        ownerId,
        companyId,
        repositoryId,
        taskId,
        agentId: taskAuthorId,
        idempotencyKey: `task-${index}-workspace`,
        branchName: `alexa/${taskId.replaceAll("-", "").slice(0, 12)}-123456-task`,
        worktreeLocator: `ew-${workspaceId}`,
        baseCommit,
        headCommit: null,
        state: "COMPLETED",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: at,
        updatedAt: at,
        expiresAt: null,
      }),
    );
    orchestration.saveResult(
      EngineeringTaskResultSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        companyId,
        objectiveId,
        taskId,
        agentId: taskAuthorId,
        workspaceId,
        workspaceBaseCommit: baseCommit,
        filesChanged: [index === 1 ? "src/shared.ts" : `src/change-${index}.ts`],
        diffSummary: `Task ${index} diff`,
        validationStatus: "PASS",
        validationReportId: crypto.randomUUID(),
        reviewStatus: "NOT_REQUIRED",
        modelProvider: "test",
        modelName: "terra",
        modelTier: "TERRA",
        inputTokens: 10,
        outputTokens: 5,
        costUsd: "0.001",
        attempts: 1,
        durationMs: 10,
        status: "SUCCEEDED",
        failureCategory: null,
        warnings: [],
        completedAt: at,
      }),
    );
  }
  const service = new EngineeringIntegrationService(
    store,
    orchestration,
    runtime,
    gateway,
    reviewer,
    () => undefined,
    clock,
    60_000,
  );
  service.setApprovals(approvals);
  return Promise.resolve({ service, store, gateway, reviewer, approvals, objectiveId, tasks, runtime, orchestration });
};

const approveMerge = async (service: EngineeringIntegrationService, approvals: ApprovalService, runId: string, idempotencyKey: string) => {
  await expect(service.merge(context, runId, { idempotencyKey }))
    .rejects.toMatchObject({ code: "MERGE_APPROVAL_REQUIRED" });
  const pending = (await approvals.list(ownerId, "PENDING"))[0]!;
  await approvals.approve(ownerId, pending.id, context.sessionId,
    { ipAddress: context.ipAddress, requestId: context.requestId }, true);
};

const attachRepairManager = (fixture: Awaited<ReturnType<typeof setup>>) => {
  fixture.service.setManager({ createIntegrationRepairTask: (_context, input) => {
    const parent = fixture.orchestration.findTask(ownerId, companyId, input.parentTaskId)!;
    const objective = fixture.orchestration.findObjective(ownerId, companyId, input.objectiveId)!;
    const task = EngineeringTaskSchema.parse({ ...parent,
      id: crypto.randomUUID(), parentTaskId: parent.id, workspaceId: null,
      title: `Repair ${input.category}`, description: input.summary,
      status: "READY", attempt: 0, leaseOwner: null, leaseExpiresAt: null,
      leaseGeneration: 0, startedAt: null, completedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    fixture.orchestration.saveTask(task);
    fixture.orchestration.saveObjective({ ...objective, status: "READY", completedAt: null,
      version: objective.version + 1 });
    return Promise.resolve(task);
  } });
};

const completeRepair = (fixture: Awaited<ReturnType<typeof setup>>, taskId: string,
  changedFile = "src/repair.ts") => {
  const task = fixture.orchestration.findTask(ownerId, companyId, taskId)!;
  const workspaceId = crypto.randomUUID();
  const at = new Date().toISOString();
  fixture.runtime.createWorkspace(EngineeringWorkspaceSchema.parse({
    schemaVersion: "1", id: workspaceId, ownerId, companyId, repositoryId,
    taskId, agentId: task.assignedAgentId, idempotencyKey: taskId,
    branchName: `alexa/${taskId.replaceAll("-", "").slice(0, 12)}-123456-repair`,
    worktreeLocator: `ew-${workspaceId}`, baseCommit, headCommit: null,
    state: "COMPLETED", leaseOwner: null, leaseExpiresAt: null, leaseGeneration: 0,
    createdAt: at, updatedAt: at, expiresAt: null,
  }));
  fixture.gateway.filesByTask.set(taskId, changedFile);
  fixture.orchestration.saveTask({ ...task, workspaceId, status: "COMPLETE", completedAt: at, updatedAt: at });
  fixture.orchestration.saveResult(EngineeringTaskResultSchema.parse({
    schemaVersion: "1", id: crypto.randomUUID(), ownerId, companyId,
    objectiveId: task.objectiveId, taskId, agentId: task.assignedAgentId,
    workspaceId, workspaceBaseCommit: baseCommit, filesChanged: [changedFile],
    diffSummary: "Bounded integration repair", validationStatus: "PASS",
    validationReportId: crypto.randomUUID(), reviewStatus: "NOT_REQUIRED",
    modelProvider: "test", modelName: "terra", modelTier: "TERRA",
    inputTokens: 10, outputTokens: 5, costUsd: "0.001", attempts: 1,
    durationMs: 10, status: "SUCCEEDED", failureCategory: null,
    warnings: [], completedAt: at,
  }));
  const objective = fixture.orchestration.findObjective(ownerId, companyId, task.objectiveId)!;
  fixture.orchestration.saveObjective({ ...objective, status: "COMPLETED", completedAt: at,
    version: objective.version + 1, updatedAt: at });
};

describe("EngineeringIntegrationService", () => {
  it("integrates completed work in deterministic dependency order, validates, independently reviews, and emits a merge candidate", async () => {
    const { service, reviewer, objectiveId, tasks } = await setup();
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-happy",
    });
    expect(created.run.integrationOrder).toEqual(tasks.map((task) => task.id));
    const complete = await service.execute(context, created.run.id, "worker-one");
    expect(complete.run.status).toBe("READY");
    expect(complete.candidate).toMatchObject({
      status: "READY",
      tasksIncluded: tasks.map((task) => task.id),
      validatedHeadCommit: complete.candidate?.reviewedHeadCommit,
    });
    expect(complete.candidate?.acceptanceEvidence.every((item) => item.satisfied)).toBe(
      true,
    );
    expect(reviewer.calls).toEqual([{ security: false, reviewerAgentId: reviewerId }]);
  });

  it("runs a distinct security review for high-risk integrations", async () => {
    const { service, reviewer, objectiveId } = await setup(3, "HIGH");
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-security",
    });
    const complete = await service.execute(context, created.run.id, "worker-security");
    expect(complete.candidate?.securityReviewId).not.toBeNull();
    expect(reviewer.calls).toEqual([
      { security: false, reviewerAgentId: reviewerId },
      { security: true, reviewerAgentId: securityReviewerId },
    ]);
  });

  it("aborts and escalates a cherry-pick conflict without fabricating success", async () => {
    const { service, gateway, objectiveId } = await setup();
    gateway.conflictAt = 2;
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-conflict",
    });
    const conflicted = await service.execute(
      context,
      created.run.id,
      "worker-conflict",
    );
    expect(conflicted.run.status).toBe("CONFLICTED");
    expect(conflicted.run.conflicts).toEqual([
      expect.objectContaining({ status: "ESCALATED", attempts: 0 }),
    ]);
    expect(conflicted.candidate).toBeNull();
  });

  it("applies one eligible additive documentation resolution and still requires validation and independent review", async () => {
    const { service, gateway, reviewer, objectiveId, tasks, orchestration } = await setup();
    for (const task of tasks.slice(0, 2)) {
      gateway.filesByTask.set(task.id, "README.md");
      const result = orchestration.listResults(ownerId, companyId, objectiveId).find((item) => item.taskId === task.id)!;
      orchestration.saveResult({ ...result, filesChanged: ["README.md"] });
    }
    gateway.conflictAt = 2;
    gateway.conflictPath = "README.md";
    service.setConflictResolver({ propose: () => Promise.resolve({
      decision: "RESOLVE_ADDITIVE", confidence: 0.98, summary: "Independent append-only documentation additions.",
      providerId: "test-provider", modelId: "terra-test", costUsd: "0.001",
    }) });
    const created = await service.create(context, { objectiveId, idempotencyKey: "additive-doc-resolution" });
    const complete = await service.execute(context, created.run.id, "worker-docs");
    expect(complete.run.status).toBe("READY");
    expect(complete.run.conflicts).toEqual([expect.objectContaining({
      path: "README.md", status: "RESOLVED", attempts: 1,
      resolverModel: "terra-test", resolutionResult: "VALIDATED",
      validationReportId: complete.run.validationReportId,
    })]);
    expect(gateway.resolutions).toBe(1);
    expect(reviewer.calls).toHaveLength(1);
  });

  it("denies automatic high-risk conflicts and stops at the two-attempt ceiling", async () => {
    for (const failure of ["high-risk", "limit"] as const) {
      const { service, store, gateway, objectiveId, tasks, orchestration } = await setup();
      const conflictPath = failure === "high-risk" ? "src/auth/README.md" : "README.md";
      for (const task of tasks.slice(0, 2)) {
        gateway.filesByTask.set(task.id, conflictPath);
        const result = orchestration.listResults(ownerId, companyId, objectiveId).find((item) => item.taskId === task.id)!;
        orchestration.saveResult({ ...result, filesChanged: [conflictPath] });
      }
      gateway.conflictAt = 2;
      gateway.conflictPath = conflictPath;
      let proposals = 0;
      service.setConflictResolver({ propose: () => {
        proposals += 1;
        return Promise.resolve({ decision: "RESOLVE_ADDITIVE", confidence: 1,
          summary: "Attempt", providerId: "test", modelId: "terra", costUsd: "0.0" });
      } });
      const created = await service.create(context, { objectiveId, idempotencyKey: `conflict-${failure}` });
      if (failure === "limit") store.saveRun({ ...created.run, conflicts: [{
        id: crypto.randomUUID(), path: conflictPath, hunks: [], taskIds: tasks.slice(0, 2).map((task) => task.id),
        type: "TEXTUAL_SAFE", riskLevel: "LOW", status: "DETECTED", attempts: 2,
        resolverModel: "terra", resolverProviderId: "test", resolverAgentId: authorId,
        resolverInputTokens: 0, resolverOutputTokens: 0,
        resolutionResult: "REJECTED", validationReportId: null, summary: "Prior bounded attempts failed.",
      }] });
      const conflicted = await service.execute(context, created.run.id, `worker-${failure}`);
      expect(conflicted.run.status).toBe("CONFLICTED");
      expect(conflicted.run.conflicts[0]?.attempts).toBe(failure === "limit" ? 2 : 0);
      expect(proposals).toBe(0);
      expect(gateway.resolutions).toBe(0);
    }
  });

  it("persists at most two low-risk resolver attempts across retries", async () => {
    const fixture = await setup();
    for (const task of fixture.tasks.slice(0, 2)) {
      fixture.gateway.filesByTask.set(task.id, "README.md");
      const result = fixture.orchestration.listResults(ownerId, companyId, fixture.objectiveId)
        .find((item) => item.taskId === task.id)!;
      fixture.orchestration.saveResult({ ...result, filesChanged: ["README.md"] });
    }
    fixture.gateway.conflictPath = "README.md";
    fixture.gateway.persistentConflict = true;
    let attempts = 0;
    fixture.service.setConflictResolver({ propose: () => {
      attempts += 1;
      return Promise.resolve({ decision: "ESCALATE", confidence: 0.2,
        summary: "Insufficient additive evidence.", providerId: "test", modelId: "terra", costUsd: "0.001" });
    } });
    const created = await fixture.service.create(context, {
      objectiveId: fixture.objectiveId, idempotencyKey: "resolver-two-attempt-ceiling",
    });
    for (let index = 1; index <= 3; index += 1) {
      const view = await fixture.service.execute(context, created.run.id, `resolver-worker-${index}`);
      expect(view.run.status).toBe("CONFLICTED");
      expect(view.run.conflicts[0]?.attempts).toBe(Math.min(index, 2));
    }
    expect(attempts).toBe(2);
    expect(fixture.gateway.resolutions).toBe(0);
  });

  it("marks a ready candidate stale when the protected branch moves", async () => {
    const { service, gateway, objectiveId } = await setup();
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-stale",
    });
    await service.execute(context, created.run.id, "worker-stale");
    gateway.currentBase = "f".repeat(40);
    const stale = await service.refreshStaleness(context, created.run.id);
    expect(stale.candidate?.status).toBe("STALE");
  });

  it("merges a READY candidate only with canonical recent-auth approval and remains idempotent", async () => {
    const { service, store, gateway, approvals, objectiveId } = await setup();
    const created = await service.create(context, { objectiveId, idempotencyKey: "merge-ready-candidate" });
    const ready = await service.execute(context, created.run.id, "integration-worker");
    expect(ready.candidate?.status).toBe("READY");
    await approveMerge(service, approvals, created.run.id, "merge-once-key");
    const merged = await service.merge(context, created.run.id, { idempotencyKey: "merge-once-key" });
    expect(merged.candidate).toMatchObject({ status: "MERGED", mergedHeadCommit: ready.candidate?.headCommit });
    expect(gateway.merges).toBe(1);
    expect((await service.merge(context, created.run.id, { idempotencyKey: "merge-once-key" })).candidate?.id)
      .toBe(merged.candidate?.id);
    expect(gateway.merges).toBe(1);
    await expect(service.merge(context, created.run.id, { idempotencyKey: "different-key" }))
      .rejects.toMatchObject({ code: "MERGE_DENIED" });
    expect(store.findCandidateByRun(ownerId, companyId, created.run.id)?.status).toBe("MERGED");
  });

  it("denies stale, failed-review, missing-security-review and cross-company merge", async () => {
    for (const failure of ["stale", "review", "security", "tenant"] as const) {
      const { service, store, gateway, approvals, objectiveId } = await setup(3, failure === "security" ? "HIGH" : "MEDIUM");
      const created = await service.create(context, { objectiveId, idempotencyKey: `merge-denial-${failure}` });
      await service.execute(context, created.run.id, `integration-${failure}`);
      if (failure === "tenant") {
        await expect(service.merge({ ...context, companyId: otherCompanyId }, created.run.id,
          { idempotencyKey: "merge-tenant-key" })).rejects.toMatchObject({ code: "INTEGRATION_NOT_FOUND" });
        continue;
      }
      await approveMerge(service, approvals, created.run.id, `merge-${failure}-key`);
      const candidate = store.findCandidateByRun(ownerId, companyId, created.run.id)!;
      if (failure === "stale") gateway.currentBase = "f".repeat(40);
      if (failure === "review" || failure === "security") {
        const reviews = store.listReviews(ownerId, companyId, created.run.id);
        const review = reviews.find((item) => item.id === (failure === "review" ? candidate.reviewReportId : candidate.securityReviewId))!;
        store.saveReview({ ...review, verdict: "CHANGES_REQUIRED" });
      }
      await expect(service.merge(context, created.run.id, { idempotencyKey: `merge-${failure}-key` }))
        .rejects.toMatchObject({ code: failure === "stale" ? "STALE_CANDIDATE" : "MERGE_DENIED" });
      expect(gateway.merges).toBe(0);
    }
  });

  it("recovers a lost signed merge result with the same key without a second native merge", async () => {
    let current = new Date("2026-09-16T00:00:10.000Z");
    const { service, gateway, approvals, objectiveId } = await setup(3, "MEDIUM", () => current);
    const created = await service.create(context, { objectiveId, idempotencyKey: "merge-crash-retry" });
    await service.execute(context, created.run.id, "integration-crash");
    await approveMerge(service, approvals, created.run.id, "merge-crash-key");
    gateway.failAfterMerge = true;
    await expect(service.merge(context, created.run.id, { idempotencyKey: "merge-crash-key" })).rejects.toThrow();
    expect(gateway.merges).toBe(1);
    current = new Date(current.getTime() + 121_000);
    const recovered = await service.merge(context, created.run.id, { idempotencyKey: "merge-crash-key" });
    expect(recovered.candidate?.status).toBe("MERGED");
    expect(gateway.merges).toBe(1);
  });

  it("rejects a new combined regression despite individually passing task results", async () => {
    const { service, gateway, store, objectiveId } = await setup();
    gateway.failFinalValidation = true;
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-regression",
    });
    await expect(
      service.execute(context, created.run.id, "worker-regression"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(gateway.validations).toBe(2);
    expect((await service.view(ownerId, companyId, created.run.id)).run.status).toBe(
      "FAILED",
    );
    expect(
      store.findCandidateByRun(ownerId, companyId, created.run.id),
    ).toBeUndefined();
  });

  it("routes failed combined validation into one bounded repair task and reintegrates its result", async () => {
    const fixture = await setup();
    attachRepairManager(fixture);
    fixture.gateway.failFinalValidation = true;
    const created = await fixture.service.create(context, {
      objectiveId: fixture.objectiveId, idempotencyKey: "repair-then-reintegrate",
    });
    const repairing = await fixture.service.execute(context, created.run.id, "worker-repair-one");
    expect(repairing.run.status).toBe("REPAIRING");
    expect(repairing.run.repairCycles).toBe(1);
    expect(repairing.run.repairEvidence[0]).toMatchObject({ category: "TEST_FAILURE" });
    const repairId = repairing.run.repairTaskIds[0]!;
    expect((await fixture.service.execute(context, created.run.id, "worker-before-repair")).run.status).toBe("REPAIRING");
    completeRepair(fixture, repairId);
    const ready = await fixture.service.execute(context, created.run.id, "worker-repair-two");
    expect(ready.run.status).toBe("READY");
    expect(ready.candidate?.tasksIncluded).toContain(repairId);
    expect(Number(ready.run.repairCostUsd)).toBeCloseTo(0.001);
  });

  it("blocks and escalates after the configured repair-cycle ceiling", async () => {
    const fixture = await setup();
    attachRepairManager(fixture);
    fixture.gateway.failValidationCalls = new Set([2, 3]);
    const created = await fixture.service.create(context, {
      objectiveId: fixture.objectiveId, idempotencyKey: "repair-cycle-exhaustion",
    });
    fixture.store.saveRun({ ...created.run, maxRepairCycles: 1 });
    const repairing = await fixture.service.execute(context, created.run.id, "worker-exhaust-one");
    completeRepair(fixture, repairing.run.repairTaskIds[0]!);
    const blocked = await fixture.service.execute(context, created.run.id, "worker-exhaust-two");
    expect(blocked.run.status).toBe("BLOCKED");
    expect(blocked.run.repairCycles).toBe(1);
    expect(blocked.run.repairEvidence).toHaveLength(1);
    expect(blocked.candidate).toBeNull();
  });

  it("blocks a deterministic generated-client contract mismatch before integration", async () => {
    const { service, gateway, objectiveId, tasks, orchestration, runtime } = await setup();
    const repository = runtime.findRepository(ownerId, companyId, repositoryId)!;
    runtime.saveRepository({ ...repository, generatedPaths: [...repository.generatedPaths, "src/generated/**"], metadata: {
      ...repository.metadata,
      contractBindings: [{ sourcePath: "api/openapi.yaml", generatedPathPrefix: "src/generated" }],
    } });
    const task = tasks[0]!;
    const result = orchestration.listResults(ownerId, companyId, objectiveId)
      .find((item) => item.taskId === task.id)!;
    gateway.filesByTask.set(task.id, "api/openapi.yaml");
    orchestration.saveResult({ ...result, filesChanged: ["api/openapi.yaml"] });
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-contract-mismatch",
    });
    expect(created.run.contractFindings).toEqual([
      expect.objectContaining({ kind: "GENERATED_CLIENT_MISMATCH" }),
    ]);
    await expect(service.execute(context, created.run.id, "worker-contract"))
      .rejects.toMatchObject({ code: "INTEGRATION_NOT_READY" });
    expect((await service.view(ownerId, companyId, created.run.id)).run.status).toBe("BLOCKED");
    expect(gateway.integrations).toBe(0);
  });

  it("creates a bounded repair for an explicit generated-client mismatch and resumes after the bound output changes", async () => {
    const fixture = await setup();
    attachRepairManager(fixture);
    const repository = fixture.runtime.findRepository(ownerId, companyId, repositoryId)!;
    fixture.runtime.saveRepository({ ...repository,
      generatedPaths: [...repository.generatedPaths, "src/generated/**"],
      metadata: { ...repository.metadata, contractBindings: [{
        sourcePath: "api/openapi.yaml", generatedPathPrefix: "src/generated",
      }] },
    });
    const task = fixture.tasks[0]!;
    const result = fixture.orchestration.listResults(ownerId, companyId, fixture.objectiveId)
      .find((item) => item.taskId === task.id)!;
    fixture.gateway.filesByTask.set(task.id, "api/openapi.yaml");
    fixture.orchestration.saveResult({ ...result, filesChanged: ["api/openapi.yaml"] });
    const created = await fixture.service.create(context, {
      objectiveId: fixture.objectiveId, idempotencyKey: "contract-mismatch-repair",
    });
    const repairing = await fixture.service.execute(context, created.run.id, "worker-contract-repair");
    expect(repairing.run.status).toBe("REPAIRING");
    expect(repairing.run.repairEvidence[0]?.category).toBe("CONTRACT_MISMATCH");
    completeRepair(fixture, repairing.run.repairTaskIds[0]!, "src/generated/client.ts");
    const complete = await fixture.service.execute(context, created.run.id, "worker-contract-reintegrate");
    expect(complete.run.contractFindings).toEqual([]);
    expect(complete.run.status).toBe("READY");
  });

  it("denies READY for absent acceptance evidence, secret-redacted diff, or a head changed during review", async () => {
    for (const failure of ["acceptance", "secret", "freshness"] as const) {
      const { service, gateway, reviewer, objectiveId } = await setup();
      if (failure === "acceptance") reviewer.omitAcceptance = true;
      if (failure === "secret") gateway.diffRedactions = ["api-key"];
      if (failure === "freshness")
        reviewer.afterReview = () => {
          gateway.headCommit = "f".repeat(40);
        };
      const created = await service.create(context, {
        objectiveId,
        idempotencyKey: `phase-27-3-${failure}-denied`,
      });
      await expect(
        service.execute(context, created.run.id, `worker-${failure}`),
      ).rejects.toMatchObject({
        code: failure === "freshness" ? "STALE_CANDIDATE" : "REVIEW_FAILED",
      });
      expect(
        (await service.view(ownerId, companyId, created.run.id)).candidate,
      ).toBeNull();
    }
  });

  it("is idempotent, company-scoped, and handles ten task outputs without duplicate integration", async () => {
    const { service, gateway, objectiveId } = await setup(10);
    const first = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-scale",
    });
    const duplicate = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-scale",
    });
    expect(duplicate.run.id).toBe(first.run.id);
    await expect(
      service.view(ownerId, otherCompanyId, first.run.id),
    ).rejects.toMatchObject({ code: "INTEGRATION_NOT_FOUND" });
    const complete = await service.execute(context, first.run.id, "worker-scale");
    expect(complete.run.taskIds).toHaveLength(10);
    expect(gateway.integrations).toBe(10);
  });

  it("uses the integration worktree's registered agent when task-result order differs from dependency order", async () => {
    const { service, gateway, runtime, orchestration, objectiveId } = await setup(2, "MEDIUM", undefined, true);
    const listTasks = orchestration.listTasks.bind(orchestration);
    vi.spyOn(orchestration, "listTasks").mockImplementation((...args) => [...listTasks(...args)].reverse());
    const created = await service.create(context, { objectiveId, idempotencyKey: "distinct-integration-agent" });
    const workspace = runtime.findWorkspace(ownerId, companyId, created.run.integrationWorkspaceId);
    expect(workspace?.agentId).toBe(secondAuthorId);
    await service.execute(context, created.run.id, "worker-distinct-agent");
    const inspection = gateway.calls.find((call) => call.capability === "repository.worktree_inspect" && call.workspaceId === workspace?.id);
    expect(inspection?.agentId).toBe(workspace?.agentId);
  });

  it("revalidates a failed reviewed head without cherry-picking its commits twice", async () => {
    const { service, gateway, objectiveId } = await setup(2);
    service.setReviewerSelector({ select: () => Promise.resolve(undefined) });
    const created = await service.create(context, {
      objectiveId, idempotencyKey: "reviewer-retry-existing-head",
    });
    await expect(service.execute(context, created.run.id, "delivery-test-reviewer")).rejects.toThrow(
      "No independent repository-authorized reviewer is available.",
    );
    const firstIntegrations = gateway.calls.filter((call) => call.capability === "repository.integrate_commit").length;
    expect(firstIntegrations).toBe(2);
    service.setReviewerSelector({ select: () => Promise.resolve(reviewerId) });
    const resumed = await service.execute(context, created.run.id, "delivery-test-reviewer");
    expect(resumed.run.status).toBe("READY");
    expect(gateway.calls.filter((call) => call.capability === "repository.integrate_commit")).toHaveLength(firstIntegrations);
    expect(gateway.validations).toBe(3);
  });
});

describe("InMemoryEngineeringIntegrationStore lease fencing", () => {
  it("allows only one concurrent holder and rejects stale mutation after expiry", async () => {
    const { service, store, objectiveId } = await setup();
    const created = await service.create(context, {
      objectiveId,
      idempotencyKey: "phase-27-3-lease",
    });
    const first = store.acquireLease({
      ownerId,
      companyId,
      runId: created.run.id,
      workerId: "one",
      now: "2026-09-16T00:00:00.000Z",
      expiresAt: "2026-09-16T00:00:01.000Z",
    });
    const racing = store.acquireLease({
      ownerId,
      companyId,
      runId: created.run.id,
      workerId: "two",
      now: "2026-09-16T00:00:00.500Z",
      expiresAt: "2026-09-16T00:00:02.000Z",
    });
    expect(first).toBeDefined();
    expect(racing).toBeUndefined();
    const recovered = store.acquireLease({
      ownerId,
      companyId,
      runId: created.run.id,
      workerId: "two",
      now: "2026-09-16T00:00:01.001Z",
      expiresAt: "2026-09-16T00:00:02.000Z",
    });
    expect(recovered?.leaseGeneration).toBe((first?.leaseGeneration ?? 0) + 1);
    expect(
      store.saveRunFenced(
        created.run,
        "one",
        first!.leaseGeneration,
        "2026-09-16T00:00:01.001Z",
      ),
    ).toBe(false);
  });
});
