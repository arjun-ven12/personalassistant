import { describe, expect, it } from "vitest";
import {
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
  EngineeringTaskSchema,
  EngineeringTaskResultSchema,
  EngineeringIntegrationRunSchema,
  EngineeringMergeCandidateSchema,
  EngineeringIntegrationReviewSchema,
  EngineeringValidationReportSchema,
  EngineeringExperienceSchema,
} from "@alexa-control/shared";
import { InMemoryEngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import { InMemoryEngineeringIntegrationStore } from "../engineering-integration/store.js";
import {
  EngineeringDatasetService,
  containsDatasetSecret,
  datasetHash,
} from "./service.js";
import { InMemoryEngineeringDatasetStore } from "./store.js";
import { verifiedDatasetSource } from "../ai/distillation/source.js";

const id = () => crypto.randomUUID();
const at = "2026-10-04T01:00:00.000Z";
const fixture = () => {
  const ownerId = id(),
    companyId = id(),
    repositoryId = id(),
    objectiveId = id(),
    taskId = id(),
    workspaceId = id(),
    integrationWorkspaceId = id(),
    runId = id(),
    authorId = id(),
    reviewId = id(),
    validationId = id();
  const baseCommit = "a".repeat(40),
    headCommit = "b".repeat(40);
  const store = new InMemoryEngineeringDatasetStore(),
    orchestration = new InMemoryEngineeringOrchestrationStore(),
    runtime = new InMemoryEngineeringRuntimeStore(),
    integration = new InMemoryEngineeringIntegrationStore();
  const service = new EngineeringDatasetService(
    store,
    orchestration,
    integration,
    runtime,
    () => new Date(at),
  );
  const repository = EngineeringRepositorySchema.parse({
    schemaVersion: "1",
    id: repositoryId,
    ownerId,
    companyId,
    displayName: "Accepted fixture",
    workspaceLocatorId: "registered-repo",
    defaultBranch: "main",
    protectedBranches: ["main"],
    protectedPaths: [".env"],
    generatedPaths: [],
    commandProfileId: "node-default",
    capabilityProfileId: "engineering-default",
    authorizedAgentIds: [authorId],
    metadata: {
      languages: ["TypeScript"],
      frameworks: ["React"],
      packageManagers: ["pnpm"],
      importantFiles: ["package.json"],
    },
    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
  });
  runtime.saveRepository(repository);
  orchestration.saveObjective(
    EngineeringObjectiveSchema.parse({
      schemaVersion: "1",
      id: objectiveId,
      ownerId,
      companyId,
      repositoryId,
      workflowId: null,
      managerAgentId: id(),
      title: "Compact status card",
      description: "Add a compact status card.",
      acceptanceCriteria: ["Card renders."],
      constraints: [],
      protectedAreas: [],
      priority: "NORMAL",
      riskLevel: "LOW",
      budget: null,
      deadlineAt: null,
      status: "COMPLETED",
      clarificationQuestion: null,
      clarification: null,
      maxParallelTasks: 3,
      maxReplans: 2,
      replanCount: 0,
      managerReasoningCount: 1,
      totalInputTokens: 20,
      totalOutputTokens: 10,
      totalCostUsd: "0.001",
      version: 1,
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    }),
  );
  const task = EngineeringTaskSchema.parse({
    schemaVersion: "1",
    id: taskId,
    ownerId,
    companyId,
    objectiveId,
    parentTaskId: null,
    repositoryId,
    workspaceId,
    title: "Add status card",
    description: "Use existing component conventions.",
    acceptanceCriteria: ["Card renders."],
    taskType: "FRONTEND",
    requiredSkills: [],
    requiredCapabilities: [
      "repository.file_read",
      "repository.file_patch",
      "repository.validate",
    ],
    dependencies: [],
    riskLevel: "LOW",
    estimatedDifficulty: "LOW",
    assignedAgentId: authorId,
    assignedRole: "FRONTEND_ENGINEER",
    reviewerAgentId: id(),
    agentSessionId: id(),
    modelPolicy: {
      initialTier: "LUNA",
      currentTier: "LUNA",
      maxTier: "SOL",
      escalationCount: 0,
      reason: "Routine fixture.",
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
    createdAt: at,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
  });
  orchestration.saveTask(task);
  const result = EngineeringTaskResultSchema.parse({
    schemaVersion: "1",
    id: id(),
    ownerId,
    companyId,
    objectiveId,
    taskId,
    agentId: authorId,
    workspaceId,
    workspaceBaseCommit: baseCommit,
    filesChanged: ["src/card.tsx"],
    diffSummary: "Compact card added.",
    validationStatus: "PASS",
    validationReportId: validationId,
    reviewStatus: "NOT_REQUIRED",
    modelProvider: "openai",
    modelName: "luna",
    modelTier: "LUNA",
    inputTokens: 20,
    outputTokens: 10,
    costUsd: "0.001",
    attempts: 1,
    durationMs: 3000,
    status: "SUCCEEDED",
    failureCategory: null,
    warnings: [],
    completedAt: at,
  });
  orchestration.saveResult(result);
  const run = EngineeringIntegrationRunSchema.parse({
    schemaVersion: "1",
    id: runId,
    ownerId,
    companyId,
    repositoryId,
    objectiveId,
    idempotencyKey: "fixture-run",
    baseCommit,
    integrationBranch: "alexa/fixture-integration",
    integrationWorkspaceId,
    taskIds: [taskId],
    sourceWorkspaceIds: [workspaceId],
    integrationOrder: [taskId],
    changeMap: [],
    conflicts: [],
    status: "READY",
    securityReviewRequired: false,
    validationReportId: validationId,
    baselineValidationReportId: null,
    reviewId,
    securityReviewId: null,
    repairCycles: 0,
    maxRepairCycles: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseGeneration: 1,
    integrationDurationMs: 10,
    validationDurationMs: 10,
    reviewDurationMs: 10,
    integrationCostUsd: "0",
    reviewCostUsd: "0.001",
    securityReviewCostUsd: "0",
    repairCostUsd: "0",
    createdAt: at,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
  });
  integration.saveRun(run);
  const candidate = EngineeringMergeCandidateSchema.parse({
    schemaVersion: "1",
    id: id(),
    ownerId,
    companyId,
    runId,
    objectiveId,
    repositoryId,
    integrationWorkspaceId,
    branch: run.integrationBranch,
    baseCommit,
    headCommit,
    tasksIncluded: [taskId],
    validationReportId: validationId,
    reviewReportId: reviewId,
    securityReviewId: null,
    acceptanceEvidence: [],
    filesChanged: ["src/card.tsx"],
    diffSummary: "Card added.",
    risks: [],
    warnings: [],
    dependencyChanges: [],
    status: "MERGED",
    validatedHeadCommit: headCommit,
    reviewedHeadCommit: headCommit,
    mergeIdempotencyKey: "owner-approved-merge",
    mergedAt: at,
    mergedHeadCommit: headCommit,
    createdAt: at,
    updatedAt: at,
  });
  integration.saveCandidate(candidate);
  const review = EngineeringIntegrationReviewSchema.parse({
    id: reviewId,
    ownerId,
    companyId,
    runId,
    reviewerAgentId: id(),
    providerId: "openai",
    modelId: "luna",
    verdict: "PASS",
    dimensions: {
      correctness: 100,
      scopeAdherence: 100,
      architectureConsistency: 100,
      maintainability: 100,
      security: 100,
      tests: 100,
      regressionRisk: 100,
      acceptanceCoverage: 100,
    },
    findings: [],
    evidence: ["Registered tests pass."],
    acceptanceEvidence: [
      { criterion: "Card renders.", satisfied: true, evidence: ["Test passes."] },
    ],
    inputTokens: 10,
    outputTokens: 5,
    costUsd: "0.001",
    headCommit,
    createdAt: at,
  });
  integration.saveReview(review);
  runtime.saveValidation(
    EngineeringValidationReportSchema.parse({
      id: validationId,
      workspaceId: integrationWorkspaceId,
      status: "PASS",
      steps: [],
      durationMs: 10,
      createdAt: at,
    }),
    ownerId,
    companyId,
  );
  const experience = EngineeringExperienceSchema.parse({
    kind: "EXPERIENCE",
    ownerId,
    companyId,
    key: datasetHash([taskId, 1, workspaceId]),
    objectiveId,
    taskId,
    repositoryId,
    workspaceId,
    attempt: 1,
    generation: 1,
    context: {
      objectiveId,
      taskId,
      repositorySummary: "React status component.",
      relevantFiles: ["src/card.tsx"],
      dependencyArtifacts: [],
      acceptanceCriteria: ["Card renders."],
      constraints: [],
      protectedPaths: [".env"],
      priorFailureSummaries: [],
      memoryRefs: [],
      memorySummaries: [],
      maxTokens: 4000,
    },
    rounds: [
      {
        requestId: id(),
        context: "Actual bounded context used.",
        provider: "openai",
        model: "luna",
        outcome: "SUCCESS",
      },
    ],
    toolActions: [
      {
        capability: "repository.file_patch",
        input: '{"patch":{"path":"src/card.tsx"}}',
        observation: "Signed patch applied.",
      },
    ],
    inspectedFiles: ["src/card.tsx"],
    failures: [],
    outcome: "SUCCEEDED",
    integrity: "CLEAN",
    startedAt: at,
    completedAt: at,
  });
  const enable = async () => {
    await service.setPolicy(ownerId, companyId, repositoryId, "COMPANY_PRIVATE");
    await service.capture(experience);
    await service.recordDiff(ownerId, companyId, run, headCommit, {
      patch: "diff --git a/src/card.tsx b/src/card.tsx\n+<StatusCard />",
      files: [{ path: "src/card.tsx", additions: 1, deletions: 0, binary: false }],
      truncated: false,
      redactions: [],
    });
  };
  return {
    service,
    store,
    orchestration,
    runtime,
    integration,
    ownerId,
    companyId,
    repositoryId,
    runId,
    candidate,
    run,
    task,
    result,
    experience,
    review,
    enable,
  };
};

describe("accepted Engineering dataset", () => {
  it("revalidates canonical task text before training and refuses revoked or changed sources", async () => {
    const f = fixture();
    await f.enable();
    await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    await f.service.freeze(f.ownerId, f.companyId, "training-source-v1");
    const source = verifiedDatasetSource(f.service);
    const scope = { ownerId: f.ownerId, companyId: f.companyId };
    expect((await source.exportVerified(scope, "training-source-v1")).exampleCount).toBe(1);
    f.orchestration.saveTask({ ...f.task, description: "Different canonical task after freezing" });
    await expect(source.exportVerified(scope, "training-source-v1")).rejects.toThrow("canonical source changed");
  });
  it("defaults to excluded and cannot pool private company code", async () => {
    const f = fixture();
    await f.service.capture(f.experience);
    expect(await f.store.list(f.ownerId, f.companyId, "EXPERIENCE")).toEqual([]);
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
    await expect(
      f.service.setPolicy(f.ownerId, f.companyId, f.repositoryId, "GLOBAL_SAFE"),
    ).rejects.toThrow("Global pooling");
    await expect(
      f.service.setPolicy(f.ownerId, f.companyId, f.repositoryId, "ATHENA_INTERNAL"),
    ).rejects.toThrow("Athena repository");
  });
  it("collects once from accepted canonical validation/review/head evidence", async () => {
    const f = fixture();
    await f.enable();
    const [example] = await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    expect(example?.model).toBe("luna");
    expect(example?.accepted).toBe(true);
    await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    expect((await f.service.stats(f.ownerId, f.companyId)).eligibleExamples).toBe(1);
    expect(example?.workspaceCostUsd).toBeNull();
  });
  it.each(["READY", "CHANGES_REQUIRED", "CANCELLED"] as const)(
    "rejects unaccepted candidate %s",
    async (status) => {
      const f = fixture();
      await f.enable();
      f.integration.saveCandidate({ ...f.candidate, status });
      expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
        [],
      );
    },
  );
  it("rejects mismatched review head and author self-review", async () => {
    const f = fixture();
    await f.enable();
    f.integration.saveReview({ ...f.review, headCommit: "c".repeat(40) });
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
    f.integration.saveReview({ ...f.review, reviewerAgentId: f.result.agentId });
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
  });
  it("rejects validation failure, incomplete context and unresolved findings", async () => {
    const f = fixture();
    await f.enable();
    f.integration.saveReview({ ...f.review, findings: ["Unresolved security issue."] });
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
    f.integration.saveReview(f.review);
    f.orchestration.saveResult({ ...f.result, validationStatus: "FAIL" });
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
  });
  it("never persists seeded secrets and prevents positive training eligibility", async () => {
    const f = fixture();
    await f.service.setPolicy(
      f.ownerId,
      f.companyId,
      f.repositoryId,
      "COMPANY_PRIVATE",
    );
    const secret = "ghp_" + "a".repeat(36);
    await f.service.capture({
      ...f.experience,
      rounds: [{ ...f.experience.rounds[0]!, context: secret }],
    });
    expect(
      JSON.stringify(await f.store.list(f.ownerId, f.companyId, "EXPERIENCE")),
    ).not.toContain(secret);
    expect((await f.store.list(f.ownerId, f.companyId, "EXPERIENCE"))[0]).toMatchObject(
      { integrity: "SECRET_DETECTED", rounds: [], context: null },
    );
    await f.enable();
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toEqual(
      [],
    );
  });
  // Vitest asymmetric matchers intentionally carry unknown fixture shape.
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  it("keeps failed attempts as telemetry and freezes/export verifies exact membership", async () => {
    const f = fixture();
    await f.enable();
    await f.service.capture({
      ...f.experience,
      key: datasetHash("earlier-failure"),
      attempt: 0,
      outcome: "FAILED",
      failures: ["Test assertion failed."],
    });
    await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    const snapshot = await f.service.freeze(
      f.ownerId,
      f.companyId,
      "athena-engineering-dataset-v1",
    );
    expect(snapshot.kind === "SNAPSHOT" && snapshot.members).toHaveLength(1);
    const exported = await f.service.exportJsonl(f.ownerId, f.companyId, snapshot.key);
    expect(JSON.parse(exported.jsonl) as unknown).toMatchObject({
      context: expect.arrayContaining([
        expect.objectContaining({ outcome: "FAILED" }),
        expect.objectContaining({ outcome: "SUCCEEDED" }),
      ]),
    });
    expect((await f.service.stats(f.ownerId, f.companyId)).failedAttempts).toBe(1);
    expect(await f.service.freeze(f.ownerId, f.companyId, snapshot.key)).toEqual(
      snapshot,
    );
  });
  it("prevents cross-company source, snapshots and exports", async () => {
    const f = fixture();
    await f.enable();
    await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    await f.service.freeze(f.ownerId, f.companyId, "dataset-v1");
    const other = id();
    expect(await f.service.eligible(f.ownerId, other)).toEqual([]);
    await expect(f.service.exportJsonl(f.ownerId, other, "dataset-v1")).rejects.toThrow(
      "unavailable",
    );
    expect(await f.service.collectAccepted(f.ownerId, other, f.runId)).toEqual([]);
  });
  it("revocation and exclusions invalidate frozen exports without deleting provenance", async () => {
    const f = fixture();
    await f.enable();
    const [example] = await f.service.collectAccepted(f.ownerId, f.companyId, f.runId);
    await f.service.freeze(f.ownerId, f.companyId, "dataset-v1");
    await f.service.exclude(f.ownerId, f.companyId, example!.key);
    await expect(
      f.service.exportJsonl(f.ownerId, f.companyId, "dataset-v1"),
    ).rejects.toThrow("revoked");
    expect((await f.service.stats(f.ownerId, f.companyId)).excludedExamples).toBe(1);
    expect(
      await f.store.get(f.ownerId, f.companyId, "EXAMPLE", example!.key),
    ).toBeDefined();
  });
  it("recognizes credential classes without classifying protected path metadata as secrets", () => {
    for (const value of [
      "Bearer " + "x".repeat(24),
      "password=supersecret123",
      "AKIA" + "A".repeat(16),
      "-----BEGIN PRIVATE KEY-----",
    ])
      expect(containsDatasetSecret(value)).toBe(true);
    expect(containsDatasetSecret({ protectedPaths: [".env"] })).toBe(false);
  });
  it("keeps recovery generations distinct when the bounded attempt counter resets", async () => {
    const f = fixture(); await f.enable();
    f.orchestration.saveTask({...f.task, attempt: 3, leaseGeneration: 2});
    await f.service.capture({...f.experience, key: datasetHash("older-failed-cycle"), attempt: 3, generation: 2, outcome: "FAILED"});
    f.orchestration.saveTask({...f.task, attempt: 1, leaseGeneration: 3});
    await f.service.capture({...f.experience, key: datasetHash("new-successful-generation"), attempt: 1, generation: 3});
    expect(await f.service.collectAccepted(f.ownerId, f.companyId, f.runId)).toHaveLength(1);
  });
  it("creates an honestly labelled empty snapshot without fake production examples", async () => {
    const f = fixture();
    expect(await f.service.freeze(f.ownerId, f.companyId, "dataset-v1")).toMatchObject({
      evidence: "EMPTY",
      members: [],
    });
  });
});
