import {
  EngineeringIntegrationRunSchema,
  EngineeringMergeCandidateSchema,
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresEngineeringOrchestrationStore } from "../engineering-orchestration/postgres-store.js";
import { PostgresEngineeringRuntimeStore } from "../engineering-runtime/postgres-store.js";
import type { PostgresDatabase } from "../persistence/database.js";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresEngineeringIntegrationStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("engineering integration PostgreSQL leases", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresEngineeringIntegrationStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const repositoryId = crypto.randomUUID();
  const objectiveId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const at = "2026-09-16T00:00:00.000Z";

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(
      connectionString!,
      "engineering273",
    );
    database = isolated.database;
    cleanup = isolated.cleanup;
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `engineering-${ownerId}@example.test`, { id: ownerId }, at],
    );
    await database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'engineering-273','Engineering 273','ACTIVE','UTC','USD',$3,$4,$4)",
      [companyId, ownerId, { id: companyId, ownerId }, at],
    );
    const runtime = new PostgresEngineeringRuntimeStore(database.pool);
    await runtime.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: repositoryId,
        ownerId,
        companyId,
        displayName: "Integration lease fixture",
        workspaceLocatorId: "lease-273",
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [],
        generatedPaths: [],
        commandProfileId: "fixture",
        capabilityProfileId: "fixture",
        authorizedAgentIds: [],
        metadata: {
          languages: [],
          packageManagers: [],
          frameworks: [],
          importantFiles: [],
        },
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
    const orchestration = new PostgresEngineeringOrchestrationStore(database.pool);
    await orchestration.saveObjective(
      EngineeringObjectiveSchema.parse({
        schemaVersion: "1",
        id: objectiveId,
        ownerId,
        companyId,
        repositoryId,
        workflowId: null,
        managerAgentId: "engineering_manager",
        title: "Integration lease",
        description: "Verify durable integration fencing.",
        acceptanceCriteria: ["Stale workers cannot mutate."],
        constraints: [],
        protectedAreas: [],
        priority: "NORMAL",
        riskLevel: "LOW",
        budget: null,
        deadlineAt: null,
        status: "COMPLETED",
        clarificationQuestion: null,
        maxParallelTasks: 4,
        maxReplans: 2,
        replanCount: 0,
        managerReasoningCount: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: "0.0",
        version: 1,
        createdAt: at,
        updatedAt: at,
        completedAt: at,
      }),
    );
    store = new PostgresEngineeringIntegrationStore(database.pool);
    await store.saveRun(
      EngineeringIntegrationRunSchema.parse({
        schemaVersion: "1",
        id: runId,
        ownerId,
        companyId,
        repositoryId,
        objectiveId,
        idempotencyKey: "phase-27-3-postgres",
        baseCommit: "a".repeat(40),
        integrationBranch: "alexa/integration-lease",
        integrationWorkspaceId: workspaceId,
        taskIds: [taskId],
        sourceWorkspaceIds: [crypto.randomUUID()],
        integrationOrder: [taskId],
        changeMap: [],
        conflicts: [],
        status: "PLANNING",
        securityReviewRequired: false,
        validationReportId: null,
        baselineValidationReportId: null,
        reviewId: null,
        securityReviewId: null,
        repairCycles: 0,
        maxRepairCycles: 2,
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
      }),
    );
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("fences concurrent workers, recovers an expired holder, and denies stale mutation", async () => {
    const lease = {
      ownerId,
      companyId,
      runId,
      now: at,
      expiresAt: "2026-09-16T00:00:30.000Z",
    };
    const [left, right] = await Promise.all([
      store.acquireLease({ ...lease, workerId: "left" }),
      store.acquireLease({ ...lease, workerId: "right" }),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const winner = (left ?? right)!;
    expect(
      await store.acquireLease({
        ...lease,
        workerId: "early",
        now: "2026-09-16T00:00:29.000Z",
      }),
    ).toBeUndefined();
    const recovered = await store.acquireLease({
      ...lease,
      workerId: "recovery",
      now: "2026-09-16T00:00:31.000Z",
      expiresAt: "2026-09-16T00:01:01.000Z",
    });
    expect(recovered).toMatchObject({
      leaseOwner: "recovery",
      leaseGeneration: winner.leaseGeneration + 1,
    });
    expect(
      await store.saveRunFenced(
        EngineeringIntegrationRunSchema.parse({
          ...winner,
          status: "READY",
          updatedAt: "2026-09-16T00:00:32.000Z",
        }),
        winner.leaseOwner!,
        winner.leaseGeneration,
        "2026-09-16T00:00:32.000Z",
      ),
    ).toBe(false);
    expect(
      await store.releaseLease({
        ownerId,
        companyId,
        runId,
        workerId: winner.leaseOwner!,
        generation: winner.leaseGeneration,
        now: "2026-09-16T00:00:32.000Z",
      }),
    ).toBe(false);
    expect(
      await store.renewLease({
        ownerId,
        companyId,
        runId,
        workerId: "recovery",
        generation: recovered!.leaseGeneration,
        now: "2026-09-16T00:00:33.000Z",
        expiresAt: "2026-09-16T00:02:00.000Z",
      }),
    ).toBe(true);
    expect(
      await store.saveRunFenced(
        EngineeringIntegrationRunSchema.parse({
          ...recovered!,
          status: "REVIEWING",
          updatedAt: "2026-09-16T00:00:34.000Z",
        }),
        "recovery",
        recovered!.leaseGeneration,
        "2026-09-16T00:00:34.000Z",
      ),
    ).toBe(true);
    expect((await store.findRun(ownerId, companyId, runId))?.leaseExpiresAt).toBe(
      "2026-09-16T00:02:00.000Z",
    );
    const head = "b".repeat(40);
    const candidate = EngineeringMergeCandidateSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      ownerId,
      companyId,
      runId,
      objectiveId,
      repositoryId,
      integrationWorkspaceId: workspaceId,
      branch: "alexa/integration-lease",
      baseCommit: "a".repeat(40),
      headCommit: head,
      tasksIncluded: [taskId],
      validationReportId: crypto.randomUUID(),
      reviewReportId: crypto.randomUUID(),
      securityReviewId: null,
      acceptanceEvidence: [
        {
          criterion: "Stale workers cannot mutate.",
          evidence: ["test:passed"],
          satisfied: true,
        },
      ],
      filesChanged: ["src/test.ts"],
      diffSummary: "Tested.",
      risks: [],
      warnings: [],
      dependencyChanges: [],
      status: "READY",
      validatedHeadCommit: head,
      reviewedHeadCommit: head,
      createdAt: at,
      updatedAt: at,
    });
    const ready = EngineeringIntegrationRunSchema.parse({
      ...recovered!,
      status: "READY",
      updatedAt: "2026-09-16T00:00:35.000Z",
      completedAt: "2026-09-16T00:00:35.000Z",
    });
    expect(
      await store.commitReady(
        ready,
        candidate,
        winner.leaseOwner!,
        winner.leaseGeneration,
        "2026-09-16T00:00:35.000Z",
      ),
    ).toBe(false);
    expect(await store.findCandidateByRun(ownerId, companyId, runId)).toBeUndefined();
    expect(
      await store.commitReady(
        ready,
        candidate,
        "recovery",
        recovered!.leaseGeneration,
        "2026-09-16T00:00:35.000Z",
      ),
    ).toBe(true);
    expect((await store.findCandidateByRun(ownerId, companyId, runId))?.status).toBe(
      "READY",
    );
    expect(await store.acquireReadyLease({ ownerId, companyId, runId,
      workerId: "merge-racing", now: "2026-09-16T00:00:36.000Z",
      expiresAt: "2026-09-16T00:01:00.000Z" })).toBeUndefined();
    const mergeLease = await store.acquireReadyLease({ ownerId, companyId, runId,
      workerId: "merge-holder", now: "2026-09-16T00:02:01.000Z",
      expiresAt: "2026-09-16T00:03:01.000Z" });
    expect(mergeLease?.leaseGeneration).toBe(recovered!.leaseGeneration + 1);
    const merging = EngineeringMergeCandidateSchema.parse({ ...candidate,
      status: "MERGING", mergeIdempotencyKey: "merge-idempotency-one",
      updatedAt: "2026-09-16T00:02:02.000Z" });
    expect(await store.saveCandidateFenced(merging, "recovery", recovered!.leaseGeneration,
      "2026-09-16T00:02:02.000Z")).toBe(false);
    expect(await store.saveCandidateFenced(merging, "merge-holder", mergeLease!.leaseGeneration,
      "2026-09-16T00:02:02.000Z")).toBe(true);
    const recoveredMerge = await store.acquireReadyLease({ ownerId, companyId, runId,
      workerId: "merge-recovery", now: "2026-09-16T00:03:02.000Z",
      expiresAt: "2026-09-16T00:04:02.000Z" });
    expect(recoveredMerge?.leaseGeneration).toBe(mergeLease!.leaseGeneration + 1);
    expect(await store.saveCandidateFenced(EngineeringMergeCandidateSchema.parse({ ...merging,
      status: "MERGED", mergedAt: "2026-09-16T00:03:03.000Z", mergedHeadCommit: head,
      updatedAt: "2026-09-16T00:03:03.000Z" }), "merge-holder",
    mergeLease!.leaseGeneration, "2026-09-16T00:03:03.000Z")).toBe(false);
    expect((await store.findCandidateByRun(ownerId, companyId, runId))?.status).toBe("MERGING");
  });
});
