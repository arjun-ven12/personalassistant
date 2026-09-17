import {
  EngineeringRepositorySchema,
  EngineeringWorkspaceSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresDatabase } from "../persistence/database.js";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresEngineeringRuntimeStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("engineering runtime PostgreSQL leases", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let store: PostgresEngineeringRuntimeStore;
  const ownerId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const repositoryId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const at = "2026-09-15T00:00:00.000Z";

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(
      connectionString!,
      "engineering271",
    );
    database = isolated.database;
    cleanup = isolated.cleanup;
    await database.pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [ownerId, `engineering-${ownerId}@example.test`, { id: ownerId }, at],
    );
    await database.pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'engineering-test','Engineering Test','ACTIVE','UTC','USD',$3,$4,$4)",
      [companyId, ownerId, { id: companyId, ownerId }, at],
    );
    store = new PostgresEngineeringRuntimeStore(database.pool);
    await store.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: repositoryId,
        ownerId,
        companyId,
        displayName: "Lease fixture",
        workspaceLocatorId: "lease-fixture",
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
    await store.createWorkspace(
      EngineeringWorkspaceSchema.parse({
        schemaVersion: "1",
        id: workspaceId,
        ownerId,
        companyId,
        repositoryId,
        taskId: null,
        agentId: null,
        idempotencyKey: "lease-fixture",
        branchName: "alexa/lease-fixture",
        worktreeLocator: `ew-${workspaceId}`,
        baseCommit: "a".repeat(40),
        headCommit: "a".repeat(40),
        state: "READY",
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseGeneration: 0,
        createdAt: at,
        updatedAt: at,
        expiresAt: null,
      }),
    );
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("fences racing workers, expires crashed holders, and rejects stale mutation", async () => {
    const leaseInput = {
      ownerId,
      companyId,
      workspaceId,
      now: at,
      expiresAt: "2026-09-15T00:00:30.000Z",
    };
    const [left, right] = await Promise.all([
      store.acquireWorkspaceLease({ ...leaseInput, workerId: "worker-left" }),
      store.acquireWorkspaceLease({ ...leaseInput, workerId: "worker-right" }),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const winner = (left ?? right)!;
    expect(winner.leaseGeneration).toBe(1);

    const beforeExpiry = await store.acquireWorkspaceLease({
      ...leaseInput,
      workerId: "worker-before-expiry",
      now: "2026-09-15T00:00:29.000Z",
      expiresAt: "2026-09-15T00:00:59.000Z",
    });
    expect(beforeExpiry).toBeUndefined();

    // The original holder is treated as crashed: no release is performed.
    const recovered = await store.acquireWorkspaceLease({
      ...leaseInput,
      workerId: "worker-recovery",
      now: "2026-09-15T00:00:31.000Z",
      expiresAt: "2026-09-15T00:01:01.000Z",
    });
    expect(recovered).toMatchObject({
      leaseOwner: "worker-recovery",
      leaseGeneration: 2,
    });

    const staleMutation = EngineeringWorkspaceSchema.parse({
      ...winner,
      state: "COMPLETED",
      updatedAt: "2026-09-15T00:00:32.000Z",
    });
    await expect(
      store.saveWorkspaceWithLease({
        value: staleMutation,
        workerId: winner.leaseOwner!,
        generation: winner.leaseGeneration,
        now: "2026-09-15T00:00:32.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      store.releaseWorkspaceLease({
        ownerId,
        companyId,
        workspaceId,
        workerId: winner.leaseOwner!,
        generation: winner.leaseGeneration,
        now: "2026-09-15T00:00:32.000Z",
      }),
    ).resolves.toBe(false);

    const recoveredMutation = EngineeringWorkspaceSchema.parse({
      ...recovered!,
      state: "DIRTY",
      updatedAt: "2026-09-15T00:00:33.000Z",
    });
    await expect(
      store.saveWorkspaceWithLease({
        value: recoveredMutation,
        workerId: "worker-recovery",
        generation: recovered!.leaseGeneration,
        now: "2026-09-15T00:00:33.000Z",
      }),
    ).resolves.toBe(true);
    await expect(store.findWorkspace(ownerId, companyId, workspaceId)).resolves.toMatchObject({
      state: "DIRTY",
      leaseOwner: "worker-recovery",
      leaseGeneration: 2,
    });
  });
});
