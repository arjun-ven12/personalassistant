import { ExecutivePlanSchema, TaskRecordSchema } from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresExecutiveStore } from "../executive/postgres-store.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { PostgresTaskStore } from "../tasks/postgres-store.js";
import { PostgresReflectionStore } from "./postgres-store.js";
import { ReflectionEngineService } from "./service.js";
import { ReflectionAutomationCoordinator } from "./automation.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();
const at = "2026-08-16T00:00:00.000Z";
let database: PostgresDatabase | undefined;
describe.skipIf(!connectionString)("PostgreSQL reflection durability", () => {
  beforeAll(async () => {
    database = new PostgresDatabase(connectionString!);
    await database.migrate();
    for (const [id, email] of [
      [ownerA, "phase21c-a@example.test"],
      [ownerB, "phase21c-b@example.test"],
    ])
      await database.pool.query(
        "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,NOW(),NOW())",
        [id, email, { id }],
      );
  });
  afterAll(async () => {
    if (database) {
      await database.pool.query("DELETE FROM owners WHERE id=ANY($1::uuid[])", [
        [ownerA, ownerB],
      ]);
      await database.close();
    }
  });
  it("survives service reconstruction with exact results and owner isolation", async () => {
    const taskStore = new PostgresTaskStore(database!.pool);
    const executiveStore = new PostgresExecutiveStore(database!.pool);
    const firstStore = new PostgresReflectionStore(database!.pool);
    const task = TaskRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      name: "Measured work",
      description: "Measured work",
      goal: "Reflect",
      priority: "high",
      category: "planning",
      type: "goal_task",
      status: "completed",
      schedule: {
        kind: "none",
        timezone: "UTC",
        startAt: null,
        endAt: null,
        cronExpression: null,
        intervalSeconds: null,
        quietHours: [],
        blackoutPeriods: [],
        preview: [],
      },
      triggerSummary: "manual",
      conditionSummary: "ready",
      dependencyIds: [],
      executionPolicy: {
        safetyLevel: "informational",
        requiresApproval: false,
        requiresRecentAuthentication: false,
        requiresPrivateNetwork: false,
        requiresTrustedDevice: false,
        allowedProviders: ["manual_owner"],
        autonomousExecutionAllowed: false,
      },
      approvalPolicy: "none",
      assignedAgentIds: [],
      retryPolicy: { maxRetries: 0, strategy: "none" },
      timeoutSeconds: 60,
      deadlineAt: null,
      successCriteria: ["done"],
      failureCriteria: [],
      rollbackStrategy: "none",
      metadata: { estimatedMinutes: 60, actualMinutes: 90 },
      version: "1",
      createdAt: at,
      updatedAt: at,
    });
    await taskStore.saveTask(task);
    const plan = ExecutivePlanSchema.parse({
      id: crypto.randomUUID(),
      ownerId: ownerA,
      goalId: null,
      version: 1,
      horizon: "THIS_WEEK",
      status: "COMPLETED",
      assumptions: [],
      milestones: [],
      taskIds: [task.id],
      priorityOrder: [task.id],
      effortMinutes: 60,
      scheduleSuggestions: [],
      unscheduledTaskIds: [],
      risks: [],
      feasibilityReasons: [],
      checkpoints: [],
      confidence: 0.8,
      feasible: true,
      feasibility: "FEASIBLE",
      feasibilityReason: "fits",
      createdAt: at,
      updatedAt: at,
    });
    await executiveStore.savePlan(plan);
    const first = new ReflectionEngineService(firstStore, executiveStore, taskStore);
    const result = await first.query(ownerA, {
      type: "EVALUATE_PLAN",
      scope: "PLAN",
      entityId: plan.id,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    const restartedStore = new PostgresReflectionStore(database!.pool);
    const restarted = new ReflectionEngineService(
      restartedStore,
      new PostgresExecutiveStore(database!.pool),
      new PostgresTaskStore(database!.pool),
    );
    const again = await restarted.query(ownerA, {
      type: "EVALUATE_PLAN",
      scope: "PLAN",
      entityId: plan.id,
      periodStart: null,
      periodEnd: null,
      requestedDepth: "STANDARD",
    });
    expect(again.reflection?.id).toBe(result.reflection?.id);
    expect(
      again.reflection?.metrics.find((item) => item.name === "effort")?.variance,
    ).toBe(30);
    expect(await restartedStore.listReflections(ownerB)).toEqual([]);
    expect(await restartedStore.listPatterns(ownerB)).toEqual([]);
    expect(await restartedStore.listCalibrations(ownerB)).toEqual([]);
  });
  it("keeps daily and weekly Task Engine review schedules across reconstruction", async () => {
    const firstTasks = new PostgresTaskStore(database!.pool);
    const firstReflection = new ReflectionEngineService(
      new PostgresReflectionStore(database!.pool),
      new PostgresExecutiveStore(database!.pool),
      firstTasks,
    );
    await new ReflectionAutomationCoordinator(firstTasks, firstReflection).ensurePeriodicSchedules(ownerB);
    const restartedTasks = new PostgresTaskStore(database!.pool);
    const restartedReflection = new ReflectionEngineService(
      new PostgresReflectionStore(database!.pool),
      new PostgresExecutiveStore(database!.pool),
      restartedTasks,
    );
    await new ReflectionAutomationCoordinator(restartedTasks, restartedReflection).ensurePeriodicSchedules(ownerB);
    const schedules = (await restartedTasks.listTasks(ownerB, 500)).filter(
      (task) => task.metadata.systemTask === "reflection_review",
    );
    expect(schedules.map((task) => task.metadata.reflectionPeriod).sort()).toEqual([
      "DAILY",
      "WEEKLY",
    ]);
    expect(await restartedTasks.listTriggers(ownerB, 20)).toHaveLength(2);
  });
});
