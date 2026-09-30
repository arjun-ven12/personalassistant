import { WorkforceRuntimeMessageSchema, WorkforceRuntimeTaskSchema } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companyScope } from "../companies/scope.js";
import type { PostgresDatabase } from "../persistence/database.js";
import { createIsolatedTestDatabase, provisionTestDefaultCompany, safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresWorkforceRuntimeStore } from "./postgres-store.js";

const connectionString = safeTestDatabaseUrl();
const ownerId = crypto.randomUUID();
const companyB = crypto.randomUUID();
const at = "2026-09-27T00:00:00.000Z";
const context = (companyId: string) => ({ ownerId, companyId, role: "OWNER" as const, requestId: "workforce-scope-test" });

describe.skipIf(!connectionString)("workforce PostgreSQL company isolation", () => {
  let database: PostgresDatabase;
  let cleanup: () => Promise<void>;
  let companyA: string;
  let store: PostgresWorkforceRuntimeStore;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDatabase(connectionString!, "workforce_scope");
    database = isolated.database;
    cleanup = isolated.cleanup;
    await database.pool.query("INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)", [ownerId, `workforce-${ownerId}@example.test`, { id: ownerId }, at]);
    companyA = await provisionTestDefaultCompany(database.pool, ownerId);
    await database.pool.query("INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'second-company','Second Company','ACTIVE','UTC','USD',$3,$4,$4)", [companyB, ownerId, { id: companyB, ownerId }, at]);
    store = new PostgresWorkforceRuntimeStore(database.pool);
  }, 60_000);

  afterAll(async () => cleanup?.());

  it("keeps task reads, conflicting writes, and task messages inside one company", async () => {
    const id = crypto.randomUUID();
    const task = WorkforceRuntimeTaskSchema.parse({
      id, idempotencyKey: null, ownerId, organizationId: companyA,
      createdByAgentId: null, assignedAgentId: null, parentTaskId: null, rootTaskId: id,
      depth: 0, type: "WORK", title: "Scoped research", objective: "Research a bounded company fixture.",
      inputs: {}, evidenceRefs: [], memoryScopeRefs: [], requiredSkills: [], requiredCapabilities: [],
      preferredDepartmentId: null, priority: "normal", riskLevel: "LOW", economicBudget: 5,
      reservedCredits: 0, actualCost: 0, reservationId: null, status: "QUEUED", retryCount: 0,
      maxRetries: 0, selection: [], resultSummary: null, resultConfidence: null, aiRequestId: null,
      providerId: null, modelId: null, sandboxStatus: null, artifactCount: 0,
      createdAt: at, updatedAt: at, startedAt: null, completedAt: null, expiresAt: null,
    });
    await companyScope.run(context(companyA), () => store.saveTask(task));
    expect(await companyScope.run(context(companyB), () => store.findTask(ownerId, id))).toBeUndefined();
    expect(await companyScope.run(context(companyB), () => store.listTasks(ownerId, 10))).toEqual([]);
    expect((await store.findTask(ownerId, id))?.id).toBe(id); // Missing ambient scope is default-company only.
    await expect(companyScope.run(context(companyB), () => store.saveTask({ ...task, title: "Cross-company overwrite" }))).rejects.toThrow("scope changed");
    expect((await companyScope.run(context(companyA), () => store.findTask(ownerId, id)))?.title).toBe("Scoped research");

    const message = WorkforceRuntimeMessageSchema.parse({
      id: crypto.randomUUID(), ownerId, organizationId: companyB, fromAgentId: "test-agent",
      toAgentId: null, taskId: id, type: "STATUS_UPDATE", payload: {}, evidenceRefs: [], createdAt: at,
    });
    await expect(companyScope.run(context(companyB), () => store.saveMessage(message))).rejects.toThrow("task scope is invalid");
    const scopedMessage = { ...message, organizationId: companyA };
    await companyScope.run(context(companyA), () => store.saveMessage(scopedMessage));
    await companyScope.run(context(companyA), () => store.saveMessage(scopedMessage));
    expect(await companyScope.run(context(companyA), () => store.listMessages(ownerId, 10))).toHaveLength(1);
    await expect(companyScope.run(context(companyA), () => store.saveMessage({ ...scopedMessage, payload: { forged: true } }))).rejects.toThrow("task scope is invalid");

    await companyScope.run(context(companyA), async () => {
      const claims = await Promise.all(["worker-a", "worker-b"].map((worker) => store.claimExecution(ownerId, id, worker)));
      const winners = claims.filter((lease) => lease !== undefined);
      expect(winners).toHaveLength(1);
      const oldLease = winners[0]!;
      expect(await store.activeExecutionTaskIds(ownerId)).toContain(id);
      expect(await companyScope.run(context(companyB), () => store.activeExecutionTaskIds(ownerId))).toEqual([]);
      await store.saveTask({ ...task, status: "RUNNING" }, oldLease);
      expect(await companyScope.run(context(companyB), () => store.renewExecution(ownerId, oldLease))).toBe(false);
      expect(await store.claimExecution(ownerId, id, "recovery", true)).toBeUndefined();
      await database.pool.query("UPDATE workforce_runtime_tasks SET execution_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
      await expect(store.saveTask({ ...task, status: "COMPLETED" }, oldLease)).rejects.toThrow("stale worker");
      expect(await store.renewExecution(ownerId, oldLease)).toBe(false);
      const recovered = await store.claimExecution(ownerId, id, "recovery", true);
      expect(recovered).toBeDefined();
      expect(recovered!.token).not.toBe(oldLease.token);
      await store.releaseExecution(ownerId, oldLease);
      expect(await store.renewExecution(ownerId, recovered!)).toBe(true);
      await store.saveTask({ ...task, status: "FAILED", failureCode: "WORKER_CRASHED" }, recovered);
      await store.releaseExecution(ownerId, recovered!);
      await expect(store.saveTask({ ...task, status: "COMPLETED" }, oldLease)).rejects.toThrow("stale worker");
      expect((await store.findTask(ownerId, id))?.status).toBe("FAILED");
      const reconstructed = new PostgresWorkforceRuntimeStore(database.pool);
      const pending = await reconstructed.pendingLifecycleTasks(ownerId);
      expect(pending.map((item) => item.id)).toContain(id);
      await reconstructed.acknowledgeLifecycle(pending.find((item) => item.id === id)!);
      expect((await reconstructed.pendingLifecycleTasks(ownerId)).map((item) => item.id)).not.toContain(id);
      await store.saveTask(task);
      expect(await store.claimExecution(ownerId, id, "recovery", true)).toBeUndefined();
      const preparing = await store.claimExecution(ownerId, id, "preparing-worker");
      expect(preparing).toBeDefined();
      await database.pool.query("UPDATE workforce_runtime_tasks SET execution_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
      expect(await store.activeExecutionTaskIds(ownerId)).not.toContain(id);
      expect(await store.expiredExecutionScopes()).toContainEqual({ ownerId, companyId: companyA });
      const recoveredPreparation = await store.claimExecution(ownerId, id, "preparation-recovery", true);
      expect(recoveredPreparation).toBeDefined();
      await expect(store.saveTask({ ...task, status: "RUNNING" }, preparing)).rejects.toThrow("stale worker");
      await store.releaseExecution(ownerId, recoveredPreparation!);
    });
  });
});
