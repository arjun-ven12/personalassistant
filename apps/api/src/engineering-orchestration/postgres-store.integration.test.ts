import {
  EngineeringObjectiveSchema,
  EngineeringRepositorySchema,
  EngineeringTaskSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresEngineeringRuntimeStore } from "../engineering-runtime/postgres-store.js";
import { PostgresEngineeringOrchestrationStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("engineering orchestration PostgreSQL leases", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresEngineeringOrchestrationStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const repositoryId = crypto.randomUUID();
  const objectiveId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const at = "2026-09-16T00:00:00.000Z";

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(
      connectionString!,
      "engineering272",
    );
    database = isolated.database;
    cleanup = isolated.cleanup;
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `engineering-${ownerId}@example.test`, { id: ownerId }, at],
    );
    await database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'engineering-272','Engineering 272','ACTIVE','UTC','USD',$3,$4,$4)",
      [companyId, ownerId, { id: companyId, ownerId }, at],
    );
    const runtime = new PostgresEngineeringRuntimeStore(database.pool);
    await runtime.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: repositoryId,
        ownerId,
        companyId,
        displayName: "Lease fixture",
        workspaceLocatorId: "lease-272",
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [],
        generatedPaths: [],
        commandProfileId: "fixture",
        capabilityProfileId: "fixture",
        authorizedAgentIds: [agentId],
        metadata: { languages: [], packageManagers: [], frameworks: [], importantFiles: [] },
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      }),
    );
    store = new PostgresEngineeringOrchestrationStore(database.pool);
    await store.saveObjective(
      EngineeringObjectiveSchema.parse({
        schemaVersion: "1",
        id: objectiveId,
        ownerId,
        companyId,
        repositoryId,
        workflowId: null,
        managerAgentId: "engineering_manager",
        title: "Lease objective",
        description: "Verify durable task fencing.",
        acceptanceCriteria: ["Stale workers cannot mutate."],
        constraints: [],
        protectedAreas: [],
        priority: "NORMAL",
        riskLevel: "LOW",
        budget: null,
        deadlineAt: null,
        status: "RUNNING",
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
        completedAt: null,
      }),
    );
    await store.saveTask(
      EngineeringTaskSchema.parse({
        schemaVersion: "1",
        id: taskId,
        ownerId,
        companyId,
        objectiveId,
        parentTaskId: null,
        repositoryId,
        workspaceId: null,
        title: "Lease task",
        description: "Exercise task fencing.",
        acceptanceCriteria: ["Lease is fenced."],
        taskType: "BACKEND",
        requiredSkills: [],
        requiredCapabilities: [],
        dependencies: [],
        riskLevel: "LOW",
        estimatedDifficulty: "LOW",
        assignedAgentId: agentId,
        assignedRole: "BACKEND_ENGINEER",
        reviewerAgentId: null,
        modelPolicy: { initialTier: "LUNA", currentTier: "LUNA", maxTier: "SOL", escalationCount: 0, reason: "test" },
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
      }),
    );
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("fences a race, expires a crashed holder, and rejects stale mutation", async () => {
    const firstLease = {
      ownerId,
      companyId,
      taskId,
      now: at,
      expiresAt: "2026-09-16T00:00:30.000Z",
    };
    const [left, right] = await Promise.all([
      store.acquireTaskLease({ ...firstLease, workerId: "left" }),
      store.acquireTaskLease({ ...firstLease, workerId: "right" }),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const winner = (left ?? right)!;
    expect(winner).toMatchObject({ status: "ACTIVE", attempt: 1, leaseGeneration: 1 });

    await store.saveTask(
      EngineeringTaskSchema.parse({
        ...winner,
        status: "READY",
        updatedAt: "2026-09-16T00:00:31.000Z",
      }),
    );
    const recovered = await store.acquireTaskLease({
      ...firstLease,
      workerId: "recovery",
      now: "2026-09-16T00:00:31.000Z",
      expiresAt: "2026-09-16T00:01:01.000Z",
    });
    expect(recovered).toMatchObject({ leaseOwner: "recovery", leaseGeneration: 2 });
    await expect(
      store.saveTaskFenced(
        EngineeringTaskSchema.parse({ ...winner, status: "COMPLETE" }),
        winner.leaseOwner!,
        winner.leaseGeneration,
        "2026-09-16T00:00:32.000Z",
      ),
    ).resolves.toBe(false);
    await expect(
      store.releaseTaskLease({
        ownerId,
        companyId,
        taskId,
        workerId: winner.leaseOwner!,
        generation: winner.leaseGeneration,
        now: "2026-09-16T00:00:32.000Z",
      }),
    ).resolves.toBe(false);
  });
});
